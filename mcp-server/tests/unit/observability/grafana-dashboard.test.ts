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
import {
  BLOB_SLOTS,
  DOUBLE_SLOTS,
  EVENT_TYPES,
  NAME_VALUES,
  OUTCOME_VALUES,
} from '../../../src/metrics/_schema';
import { GUARDED_COLUMNS, assertFieldEventTypeAgreement } from '../../helpers/ae-sql-guards';

const raw = readFileSync(
  resolve(__dirname, '../../../observability/grafana-dashboard.json'),
  'utf-8'
);

const dashboard = JSON.parse(raw) as {
  __inputs: { pluginId: string }[];
  panels: {
    id?: number;
    type: string;
    title?: string;
    description?: string;
    targets?: { query?: string; format?: string }[];
  }[];
};

/**
 * Every panel that carries SQL, flattened with its title for assertion messages.
 *
 * `format` is carried through deliberately: it is the target-level field that
 * decides whether Grafana reads the result as a time series or a table, and
 * BL-158's merge bug was only detectable by reading it alongside the GROUP BY.
 */
const queries: { title: string; sql: string; description: string; format: string }[] =
  dashboard.panels
    .filter((p) => Array.isArray(p.targets) && p.targets.length > 0)
    .flatMap((p) =>
      (p.targets ?? []).map((t) => ({
        title: p.title ?? `panel ${p.id}`,
        sql: t.query ?? '',
        description: p.description ?? '',
        format: t.format ?? '',
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
 * `health_check` has no emitter at all; `prompt_span`, `wrong_irl_detected`
 * and `gate_elided` have emitter functions that nothing in `src/` calls.
 * Tracked as BL-157.
 *
 * `rate_limit_decision` LEFT this list when BL-157 wired its emitter in
 * `metrics/pipeline-events.ts` — refusals only, never `allow`, which is what
 * the separate allow-series guard below protects.
 */
const NON_EMITTING_TYPES = [
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

  it('declares each key once per object, which JSON.parse cannot tell you', () => {
    // Every other rule in this file reads `dashboard`, i.e. post-JSON.parse —
    // and a duplicate key is invisible there, because the LAST one silently
    // wins. BL-159 shipped exactly that: an edit added a corrected panel
    // description ABOVE the stale one instead of replacing it, so the panel
    // parsed fine, every guard passed, and Grafana would have rendered the old
    // text under the new title. Found in review, not by a test.
    //
    // Checked on the raw bytes, since by definition the parsed object no
    // longer holds the evidence. Object depth tracks which keys are siblings.
    const duplicates: string[] = [];
    const seen: Set<string>[] = [];
    // Strip string literals first so a brace or quote INSIDE a description
    // (these run to paragraphs) cannot desynchronise the depth counter; keys
    // are recovered from the same pass rather than a second scan.
    const tokens = raw.matchAll(/"(?:[^"\\]|\\.)*"\s*:|"(?:[^"\\]|\\.)*"|[{}]/g);
    for (const [tok] of tokens) {
      if (tok === '{') seen.push(new Set());
      else if (tok === '}') seen.pop();
      else if (tok.endsWith(':')) {
        const key = tok.slice(0, tok.lastIndexOf('"') + 1);
        const scope = seen[seen.length - 1];
        if (!scope) continue;
        if (scope.has(key)) duplicates.push(key);
        else scope.add(key);
      }
    }
    expect(seen.length, 'brace tracking did not balance — the scanner is broken').toBe(0);
    expect(duplicates, 'a key is declared twice in one object; the second silently wins').toEqual(
      []
    );
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
      // `count(DISTINCT x)` is exempt and must stay exempt: it is a DIFFERENT
      // aggregate from the row counter this rule is about, there is no weighted
      // form of it to prefer, and the panel that uses it carries the caveat
      // enforced below. Rejecting it outright (as this rule did until BL-158)
      // would make the correct query fail and invite weakening the guard.
      const countCalls = [...q.sql.matchAll(/\bcount\s*\(\s*(\w*)/gi)];
      for (const [, firstToken] of countCalls) {
        expect(
          firstToken.toUpperCase(),
          `${q.title} uses bare count() — use sum(_sample_interval), or count(DISTINCT x) for a distinct count`
        ).toBe('DISTINCT');
      }
      expect(q.sql, `${q.title} uses unweighted avg() — weight by _sample_interval`).not.toMatch(
        /\bavg\s*\(/i
      );
      // `quantileWeighted(` is the correct form and must not trip this.
      expect(q.sql, `${q.title} uses unweighted quantile()`).not.toMatch(/\bquantile\s*\(/i);
    }
  });

  it('states the sampling caveat on any panel that counts distinct values', () => {
    // A distinct-count is the one shape Cloudflare publishes NO sample
    // correction for, because a distinct-count over dropped rows cannot be
    // weighted back. Note this is NOT the corrected row counter: `count()`
    // corrects to `sum(_sample_interval)`, `count(DISTINCT x)` corrects to
    // nothing. A number on a dashboard gets trusted more than a number in a
    // doc, so the caveat has to travel with the panel.
    //
    // Matches both spellings on purpose. BL-158 moved this dashboard from
    // `uniq` (absent from Cloudflare's aggregate reference) to the documented
    // `count(DISTINCT x)`; the CAVEAT is the invariant, the spelling is not.
    // The floor below stays so the rule cannot go vacuous if the panel is
    // deleted — a rule that iterates zero matches passes while proving nothing.
    const distinctPanels = queries.filter((q) =>
      /\buniq\s*\(|\bcount\s*\(\s*DISTINCT\b/i.test(q.sql)
    );
    expect(distinctPanels.length, 'expected at least one distinct-count panel').toBeGreaterThan(0);
    for (const q of distinctPanels) {
      expect(
        q.description.toLowerCase(),
        `${q.title} counts distinct values and must carry the sampling caveat in its description`
      ).toContain('sampl');
    }
  });
});

describe('grafana-dashboard.json — series shape and supported aggregates (BL-158)', () => {
  it('never splits a time-series panel with GROUP BY — that merges instead of splitting', () => {
    // THE BL-158 defect, made mechanical. The Altinity plugin turns extra
    // COLUMNS into series; an extra GROUP BY term returns extra ROWS per
    // timestamp, which collapse into ONE line carrying the aggregate's alias.
    // The panel is not empty and does not error — it renders a single series
    // titled `n` while looking exactly like a working breakdown, which is why
    // review missed it and execution found it in minutes.
    //
    // The fix is one `sumIf(_sample_interval, col = 'value') AS value` column
    // per value, which is why the next rule checks those lists are complete.
    //
    // Floor first, for the same reason the distinct-count rule keeps one: this
    // rule iterates a FILTERED set, so if the last time_series panel were ever
    // removed or its `format` renamed, it would pass over nothing and report
    // success. A rule that cannot fail is not a guard.
    const timeSeries = queries.filter((q) => q.format === 'time_series');
    expect(timeSeries.length, 'expected at least one time_series panel').toBeGreaterThan(0);

    for (const q of timeSeries) {
      const groupByMatch = /\bGROUP BY\b([\s\S]*?)(?:\bHAVING\b|\bORDER BY\b|\bLIMIT\b|$)/i.exec(
        q.sql
      );
      if (!groupByMatch) continue;
      const terms = groupByMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const term of terms) {
        expect(
          term,
          `${q.title} is a time_series panel grouping by "${term}" — that returns extra ROWS per timestamp, which Grafana merges into one series. Use one sumIf() column per value instead (BL-158)`
        ).toBe(TIME_MACRO_ALIAS);
      }
    }
  });

  it('uses only aggregates Cloudflare documents for Analytics Engine', () => {
    // The OTHER BL-158 defect, made mechanical. `uniq()` shipped on the belief
    // that AE supported it; it is absent from Cloudflare's aggregate reference,
    // and an unsupported function is a red PANEL nobody is watching rather than
    // a red test. Note absence from the reference is not proof of rejection —
    // `quantileWeighted` is documented only as a backward-compat alias and
    // demonstrably executes (`status-metrics.ts`, and /status renders its
    // output) — so this list is "what Cloudflare documents", and the rule is
    // "prefer the documented spelling", not "everything else is broken".
    //
    // Transcribed 2026-09-09 from
    // https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/aggregate-functions/
    //
    // This is also why the panels above are hand-written `sumIf` columns rather
    // than Altinity's `$columns(key, value)` macro, which exists for exactly
    // that job: `$columns` expands to `groupArray` over a subquery, and
    // `groupArray` is absent from the reference above — so the macro would trip
    // this rule if it were spelled out, and it also violates the flat-SELECT
    // rule. Choosing `sumIf` made the question moot instead of needing a probe.
    const AE_SUPPORTED_AGGREGATES = new Set(
      [
        'count',
        'sum',
        'avg',
        'min',
        'max',
        'quantileExactWeighted',
        'quantileWeighted',
        'argMax',
        'argMin',
        'first_value',
        'last_value',
        'topK',
        'topKWeighted',
        'countIf',
        'sumIf',
        'avgIf',
      ].map((f) => f.toLowerCase())
    );

    // Identifiers that appear in call position but are not aggregates. Kept
    // explicit so a genuinely unknown function fails rather than being skipped
    // by an over-broad exclusion.
    const NON_AGGREGATE_CALLABLES = new Set(['in', 'now', 'interval', 'toDateTime'.toLowerCase()]);

    for (const q of queries) {
      for (const [, fn] of q.sql.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
        const name = fn.toLowerCase();
        if (NON_AGGREGATE_CALLABLES.has(name)) continue;
        expect(
          AE_SUPPORTED_AGGREGATES.has(name),
          `${q.title} calls "${fn}(", which Cloudflare's Analytics Engine aggregate reference does not document — an unsupported function renders as a query error, not an empty chart (BL-158)`
        ).toBe(true);
      }
    }
  });

  it('never reads a field the queried event types do not write', () => {
    // BL-159. The Status codes panel grouped tool_invocation by blob6 and
    // returned exactly one row over 863 real invocations: the empty string.
    // Every existing guard passed it, because blob6 IS a real column and those
    // ARE declared event types — the missing relationship is which types write
    // which field, which `FIELD_EMITTED_BY` now carries as data.
    expect(Object.keys(GUARDED_COLUMNS).length, 'no guarded columns resolved').toBeGreaterThan(0);
    for (const q of queries) assertFieldEventTypeAgreement(q.title, q.sql);
  });

  it('gives every enumerable split panel one sumIf column per schema value', () => {
    // Completeness for the fix above: with the split expressed as columns, a
    // value with no column is simply never plotted — silently, and forever.
    // Binding the list to the schema means adding an outcome fails here rather
    // than going unobserved.
    //
    // Exclusions are the sharp edge and are deliberately explicit. Each one is
    // a value the schema declares but THIS panel must not plot, because the
    // series would be permanently zero — the same "empty reads as good news"
    // failure the vacuity guard exists for, one layer down.
    //
    // NOT every split panel is here, despite the title. "Invocations over time,
    // by primitive" splits `blob1` over a CURATED 3-of-13 subset of EVENT_TYPES
    // (the request primitives), not over an enum — binding it to EVENT_TYPES
    // would demand a column for `cron_outcome` and every dead type. Its own
    // `WHERE blob1 IN (...)` is the list, and the event-type guard below already
    // pins those literals to the schema. Stated so the next reader does not
    // assume a coverage this rule does not claim.
    const cases: {
      title: string;
      column: string;
      values: readonly string[];
      excluded: readonly string[];
    }[] = [
      {
        title: 'Trial signups over time, by outcome',
        column: 'blob4',
        values: OUTCOME_VALUES.trial_signup,
        excluded: [],
      },
      {
        title: 'Refusals over time, by outcome',
        column: 'blob4',
        values: OUTCOME_VALUES.rate_limit_decision,
        // ADR-0032: emitted on refusal only. Also enforced by the allow-series
        // rule below — the two must agree, or one of them is wrong.
        excluded: ['allow'],
      },
      {
        title: 'Zone-1 calls over time, by category',
        column: 'blob2',
        values: NAME_VALUES.inoreader_call ?? [],
        // `oauth-refresh` is the one category carrying zone1='0', and this
        // panel filters blob7 = '1'. Its series could never be non-zero.
        excluded: ['oauth-refresh'],
      },
    ];

    for (const c of cases) {
      const panel = queries.find((q) => q.title === c.title);
      expect(
        panel,
        `no panel titled "${c.title}" — this guard is asserting over nothing`
      ).toBeDefined();
      expect(c.values.length, `${c.title}: schema value list is empty`).toBeGreaterThan(0);

      for (const value of c.values) {
        const plotted = new RegExp(
          `sumIf\\s*\\(\\s*_sample_interval\\s*,\\s*${c.column}\\s*=\\s*'${value}'\\s*\\)`,
          'i'
        ).test(panel!.sql);
        if (c.excluded.includes(value)) {
          expect(
            plotted,
            `${c.title} plots "${value}", which is excluded on purpose — the series would be permanently zero and read as a stopped signal`
          ).toBe(false);
        } else {
          expect(
            plotted,
            `${c.title} has no sumIf column for "${value}" — the schema declares it, so it would go unplotted silently (BL-158)`
          ).toBe(true);
        }
      }
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

  it('never plots an "allow" series, which is emitted by design and always empty', () => {
    // ADR-0032: `rate_limit_decision` is emitted ONLY on refusal. An `allow`
    // series would therefore render permanently empty — and unlike the dead
    // event types above, the event type itself IS live, so the vacuity guard
    // cannot catch it. The failure mode is the same and worse: a flat line at
    // zero next to real deny data reads as "nothing is being allowed through"
    // or "we stopped counting", rather than "this was never recorded".
    for (const q of queries) {
      if (!q.sql.includes('rate_limit_decision')) continue;
      expect(
        q.sql,
        `${q.title} filters rate_limit_decision on 'allow', which is never emitted (ADR-0032) — the series would be permanently empty`
      ).not.toMatch(/'allow'/);
    }
  });

  it('carries a panel for every event type that BL-157 newly wired', () => {
    // Vacuity guard's mirror image: wiring an emitter without a panel leaves
    // the data unobserved, which is the gap this whole change exists to close.
    const allSql = queries.map((q) => q.sql).join('\n');
    for (const type of ['rate_limit_decision', 'tier_denial', 'scope_denial']) {
      expect(EVENT_TYPES as readonly string[], `${type} must still be declared`).toContain(type);
      expect(allSql, `${type} is emitted in production but no panel reads it`).toContain(type);
    }
  });

  it('explains each omission in the text panel, so nobody re-adds them', () => {
    const text = JSON.stringify(dashboard.panels.filter((p) => p.type === 'text'));
    for (const type of NON_EMITTING_TYPES) {
      expect(text, `the text panel must explain why ${type} has no panel`).toContain(type);
    }
  });
});
