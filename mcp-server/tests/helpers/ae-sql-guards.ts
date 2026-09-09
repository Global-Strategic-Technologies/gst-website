/**
 * The BL-159 rule, shared by the two guards that check AE SQL: the dashboard
 * panels (`grafana-dashboard.test.ts`) and the alert rules
 * (`alert-rules-sql.test.ts`).
 *
 * It lives here rather than in either test because it was duplicated across
 * both, and the two copies had already diverged — the alert-rule copy never
 * parsed `blob1 IN (...)`, so an alert query written in that shape would have
 * skipped the check silently. Two copies of an anti-drift rule drift; that is
 * the whole lesson of the stanza these guards exist for.
 *
 * The defect being made mechanical: a query can name a real column, filter on
 * real event types, and obey every dialect rule while being structurally
 * unable to return anything. Not hypothetical — it shipped three times in two
 * days, once in a PAGE-severity alert that reported a healthy `0` for its
 * entire life.
 */
import { expect } from 'vitest';
import { BLOB_SLOTS, FIELD_EMITTED_BY } from '../../src/metrics/_schema';

/**
 * Column -> the `MetricEvent` field it carries, for the narrow fields
 * `FIELD_EMITTED_BY` governs. Derived from `BLOB_SLOTS` so a slot renumbering
 * cannot silently point this rule at the wrong column.
 */
export const GUARDED_COLUMNS = Object.fromEntries(
  Object.keys(FIELD_EMITTED_BY).map((field) => {
    const slot = BLOB_SLOTS.find((b) => b.field === field);
    if (!slot) throw new Error(`FIELD_EMITTED_BY names "${field}", absent from BLOB_SLOTS`);
    return [`blob${slot.slot}`, field];
  })
) as Record<string, string>;

/**
 * Assert that any query touching a narrowly-emitted column restricts `blob1`
 * to event types that actually write it.
 *
 * `label` names the panel or rule in the failure message — these guards read
 * artifacts, so a bare assertion failure would not say which one.
 */
export function assertFieldEventTypeAgreement(label: string, sql: string): void {
  for (const [column, field] of Object.entries(GUARDED_COLUMNS)) {
    if (!new RegExp(`\\b${column}\\b`).test(sql)) continue;

    const literals = [...sql.matchAll(/blob1\s*(?:=|IN\s*\()\s*'([^']+)'/gi)].map((m) => m[1]);
    for (const inClause of sql.matchAll(/blob1\s+IN\s*\(([^)]*)\)/gi)) {
      for (const [, lit] of inClause[1].matchAll(/'([^']+)'/g)) literals.push(lit);
    }
    expect(
      literals.length,
      `${label} reads ${column} (${field}) without constraining blob1 — it would aggregate over event types that never write it`
    ).toBeGreaterThan(0);

    const emitters = FIELD_EMITTED_BY[field];
    for (const type of new Set(literals)) {
      expect(
        emitters as readonly string[],
        `${label} reads ${column} (${field}) for event type "${type}", which never writes it — the query is structurally incapable of returning a value (BL-159)`
      ).toContain(type);
    }
  }
}
