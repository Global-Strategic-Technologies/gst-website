/**
 * Guard for `observability/grafana-dashboard.json` (BL-032.75's last deferred
 * item, shipped 2026-09-08).
 *
 * The dashboard is JSON that renders in a tool this repo does not run, so the
 * usual "does it work" test is impossible. What IS checkable is that its SQL
 * obeys the two dialect rules this codebase has already been bitten by, and
 * that it never queries something nothing emits. Both classes of defect are
 * silent in Grafana — a rejected query renders as an error panel nobody is
 * watching, and a query over a dead event type renders as an empty chart that
 * reads like good news.
 *
 * Precedent: `runbook-freshness.test.ts` — same workspace, same job (a test
 * validating a non-code artifact under `mcp-server/observability/`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BLOB_SLOTS, DOUBLE_SLOTS, EVENT_TYPES } from '../../../src/metrics/_schema';

const dashboard = JSON.parse(
  readFileSync(resolve(__dirname, '../../../observability/grafana-dashboard.json'), 'utf-8')
) as {
  __inputs: { pluginId: string }[];
  panels: {
    id?: number;
    type: string;
    title?: string;
    description?: string;
    targets?: { query?: string }[];
  }[];
};

/** Every panel that carries SQL, flattened with its title for assertion messages. */
const queries: { title: string; sql: string; description: string }[] = dashboard.panels
  .filter((p) => Array.isArray(p.targets) && p.targets.length > 0)
  .flatMap((p) =>
    (p.targets ?? []).map((t) => ({
      title: p.title ?? `panel ${p.id}`,
      sql: t.query ?? '',
      description: p.description ?? '',
    }))
  );

/**
 * Columns a `GROUP BY` may legally name. Derived from the schema rather than
 * written out, so a slot added to `BLOB_SLOTS` is groupable here without a
 * second edit — and a slot REMOVED makes any panel still grouping by it fail.
 */
const RAW_COLUMNS = new Set([
  ...BLOB_SLOTS.map((b) => `blob${b.slot}`),
  ...DOUBLE_SLOTS.map((d) => `double${d.slot}`),
  'index1',
  'timestamp',
  '_sample_interval',
]);

/**
 * The alias Grafana's time macro is bound to (`SELECT $timeSeries AS t`).
 * Grouping by it is not just allowed but REQUIRED for a time-series panel, so
 * it is excluded from the alias set below rather than tripping the alias rule.
 */
const TIME_MACRO_ALIAS = 't';

/**
 * Event types with no production emitter. A panel over any of these renders an
 * empty chart that reads as "nothing is wrong" rather than "nothing is
 * recorded" — the precise failure this guard exists to prevent. Widening this
 * list is fine; quietly querying one of them is not.
 *
 * `rate_limit_decision` and `health_check` have no emitter at all;
 * `prompt_span`, `wrong_irl_detected` and `gate_elided` have emitter functions
 * that nothing in `src/` calls. Tracked as BL-157.
 */
const NON_EMITTING_TYPES = [
  'rate_limit_decision',
  'health_check',
  'prompt_span',
  'wrong_irl_detected',
  'gate_elided',
] as const;

describe('grafana-dashboard.json — structure', () => {
  it('declares the Altinity ClickHouse plugin by its exact id', () => {
    // An import fails outright on a wrong plugin id, and the macros this
    // dashboard depends on ($timeSeries / $timeFilter) are Altinity's. The
    // repo's own docs recorded "Infinity" until 2026-09-08 — this pins the
    // correction so it cannot drift back.
    expect(dashboard.__inputs.map((i) => i.pluginId)).toContain('vertamedia-clickhouse-datasource');
  });

  it('gives every panel a title, and every query panel a non-empty query', () => {
    for (const panel of dashboard.panels) {
      if (panel.type === 'row') continue;
      expect(panel.title, `panel ${panel.id} needs a title`).toBeTruthy();
    }
    expect(queries.length, 'the dashboard must carry SQL panels').toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.sql.trim(), `${q.title} has an empty query`).not.toBe('');
    }
  });
});

describe('grafana-dashboard.json — AE dialect rules', () => {
  it('keeps every query a single flat SELECT', () => {
    // Every check below parses by position and would mis-read a subquery or a
    // CTE. Rather than assume the shape, assert it: a nested SELECT fails here
    // instead of silently weakening the rules that follow.
    for (const q of queries) {
      const selects = q.sql.match(/\bSELECT\b/gi) ?? [];
      expect(selects.length, `${q.title} must be one flat SELECT (no subquery/CTE)`).toBe(1);
      expect(q.sql, `${q.title} must not use a CTE`).not.toMatch(/\bWITH\b/i);
    }
  });

  it('groups by raw columns, never by a SELECT alias', () => {
    // THE rule this repo keeps relearning: the AE dialect rejects an alias in
    // GROUP BY (`status-metrics.ts` says so in terms, and a code review caught
    // it in AUTH.md this same session). Aliases stay legal in SELECT and
    // ORDER BY — only GROUP BY is constrained.
    for (const q of queries) {
      const groupByMatch = /\bGROUP BY\b([\s\S]*?)(?:\bHAVING\b|\bORDER BY\b|\bLIMIT\b|$)/i.exec(
        q.sql
      );
      if (!groupByMatch) continue;

      const beforeGroupBy = q.sql.slice(0, groupByMatch.index);
      // Aliases bound to a $-macro are excluded: `$timeSeries AS t` MUST be
      // grouped by `t`, so counting it as an alias would reject every
      // time-series panel in the file.
      const aliases = new Set(
        [...beforeGroupBy.matchAll(/(\S+)\s+AS\s+(\w+)/gi)]
          .filter((m) => !m[1].includes('$'))
          .map((m) => m[2])
      );

      const terms = groupByMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      expect(terms.length, `${q.title} has an empty GROUP BY`).toBeGreaterThan(0);

      for (const term of terms) {
        expect(
          aliases.has(term),
          `${q.title} groups by the SELECT alias "${term}" — the AE dialect rejects it; use the raw column`
        ).toBe(false);
        expect(
          RAW_COLUMNS.has(term) || term === TIME_MACRO_ALIAS,
          `${q.title} groups by "${term}", which is neither a schema column nor the time macro alias`
        ).toBe(true);
      }
    }
  });

  it('weights every aggregate by the sample interval', () => {
    // AE samples. An unweighted count/avg/quantile silently under-reports, and
    // the number looks perfectly reasonable while being wrong.
    for (const q of queries) {
      expect(q.sql, `${q.title} uses bare count() — use sum(_sample_interval)`).not.toMatch(
        /\bcount\s*\(/i
      );
      expect(q.sql, `${q.title} uses unweighted avg() — weight by _sample_interval`).not.toMatch(
        /\bavg\s*\(/i
      );
      // `quantileWeighted(` is the correct form and must not trip this.
      expect(q.sql, `${q.title} uses unweighted quantile()`).not.toMatch(/\bquantile\s*\(/i);
    }
  });

  it('states the sampling caveat on any panel that counts distinct values', () => {
    // `uniq` is the one aggregate Cloudflare publishes NO sample correction
    // for, because a distinct-count over dropped rows cannot be weighted back.
    // A number on a dashboard gets trusted more than a number in a doc, so the
    // caveat has to travel with the panel.
    const uniqPanels = queries.filter((q) => /\buniq\s*\(/i.test(q.sql));
    expect(uniqPanels.length, 'expected at least one uniq() panel').toBeGreaterThan(0);
    for (const q of uniqPanels) {
      expect(
        q.description.toLowerCase(),
        `${q.title} uses uniq() and must carry the sampling caveat in its description`
      ).toContain('sampl');
    }
  });
});

describe('grafana-dashboard.json — bound to the metrics schema', () => {
  it('references only blob and double slots the schema defines', () => {
    const maxBlob = Math.max(...BLOB_SLOTS.map((b) => b.slot));
    const maxDouble = Math.max(...DOUBLE_SLOTS.map((d) => d.slot));
    for (const q of queries) {
      for (const [, n] of q.sql.matchAll(/\bblob(\d+)\b/g)) {
        expect(
          Number(n),
          `${q.title} references blob${n}, beyond the column map`
        ).toBeLessThanOrEqual(maxBlob);
      }
      for (const [, n] of q.sql.matchAll(/\bdouble(\d+)\b/g)) {
        expect(
          Number(n),
          `${q.title} references double${n}, beyond the column map`
        ).toBeLessThanOrEqual(maxDouble);
      }
    }
  });

  it('filters on event types the schema actually declares', () => {
    // Catches a typo'd or renamed event type: the panel would return zero rows
    // forever and look like a quiet week.
    const declared = new Set<string>(EVENT_TYPES);
    for (const q of queries) {
      for (const [, literal] of q.sql.matchAll(/blob1\s*(?:=|IN\s*\()\s*'([^']+)'/gi)) {
        expect(declared.has(literal), `${q.title} filters on unknown event type "${literal}"`).toBe(
          true
        );
      }
      // The IN(...) form carries additional literals after the first.
      for (const inClause of q.sql.matchAll(/blob1\s+IN\s*\(([^)]*)\)/gi)) {
        for (const [, literal] of inClause[1].matchAll(/'([^']+)'/g)) {
          expect(
            declared.has(literal),
            `${q.title} filters on unknown event type "${literal}"`
          ).toBe(true);
        }
      }
    }
  });

  it('never builds a panel over an event type nothing emits', () => {
    // Vacuity guard first: these must still be real declared types, or this
    // test passes by asserting over names that no longer exist.
    for (const type of NON_EMITTING_TYPES) {
      expect(
        EVENT_TYPES as readonly string[],
        `${type} is no longer a declared event type`
      ).toContain(type);
    }
    for (const q of queries) {
      for (const type of NON_EMITTING_TYPES) {
        expect(
          q.sql,
          `${q.title} queries "${type}", which nothing emits — the panel would render empty and read as good news (BL-157)`
        ).not.toContain(type);
      }
    }
  });

  it('explains each omission in the text panel, so nobody re-adds them', () => {
    const text = JSON.stringify(dashboard.panels.filter((p) => p.type === 'text'));
    for (const type of NON_EMITTING_TYPES) {
      expect(text, `the text panel must explain why ${type} has no panel`).toContain(type);
    }
  });
});
