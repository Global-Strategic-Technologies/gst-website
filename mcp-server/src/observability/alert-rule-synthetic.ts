/**
 * BL-047 T1 — alert-rule synthetic dispatcher.
 *
 * Posts a single Sentry event tagged `alert-rule-synthetic: 1` so the
 * operator's Slack `#mcp-alerts` channel receives a verifiable weekly
 * heartbeat that the BL-047 alert rules are still wired end-to-end.
 *
 * Without this synthetic, a silently-broken Slack integration (revoked
 * webhook, deleted rule, expired token) would first surface only on a
 * real OAuth incident — by which time the recovery clock is already
 * running.
 *
 * Fires from the scheduled handler on `event.cron === '0 14 * * 1'`
 * (Mondays 14:00 UTC). One POST per firing; the synthetic itself is the
 * primary work. Never throws — `postSentryEvent` carries the same
 * never-throws contract as the rest of `sentry-envelope.ts`.
 *
 * Operator runbook: `src/docs/operations/SENTRY_ALERT_RULES.md` §
 * Synthetic.
 */

import { safeLog } from '../auth/safe-logger';
import { postSentryEvent } from './sentry-envelope';
import type { Env } from '../worker';

/**
 * Single source of truth for the synthetic cron expression. Both the
 * `worker.ts` dispatch branch and this dispatcher's `extra.cron` payload
 * read from here, so a future cadence change (e.g. twice-weekly during
 * a high-incident period) is a one-line edit.
 */
export const SYNTHETIC_CRON = '0 14 * * 1';

/**
 * ISO-8601 year-week string (e.g. `2026-W22`).
 *
 * Used in the synthetic's Sentry message so each week's firing becomes a
 * NEW Sentry Issue rather than grouping into a single long-lived issue.
 * Sentry's "A new issue is created" trigger fires only on first-ever
 * occurrence of a fingerprint; without per-week message variation, every
 * Monday after the first would silently group into the same issue and
 * never page. The dual-trigger fallback ("A resolved issue becomes
 * unresolved") would require the operator to manually mark Resolved
 * every Monday — defeating the synthetic's "no human in the loop" goal.
 *
 * Exported for unit-testability.
 */
export function isoYearWeek(d: Date): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // shift to ISO-week Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function dispatchAlertRuleSynthetic(env: Env): Promise<void> {
  const startedAt = Date.now();
  const yearWeek = isoYearWeek(new Date());
  safeLog({
    event: 'alert-rule-synthetic.dispatch',
    success: true,
  });
  await postSentryEvent(env, {
    level: 'info',
    message: `alert-rule-synthetic: weekly heartbeat ${yearWeek}`,
    tags: {
      event: 'alert-rule-synthetic',
      'alert-rule-synthetic': '1',
      'year-week': yearWeek,
      environment: env.ENV_NAME ?? 'unknown',
    },
    extra: {
      source: 'cron.scheduled',
      cron: SYNTHETIC_CRON,
      yearWeek,
      purpose:
        'Operator-visible weekly proof that BL-047 T1 alert rules + Slack integration are wired. The ISO year-week in the message forces Sentry to create a new Issue per week so "A new issue is created" trigger fires weekly. See SENTRY_ALERT_RULES.md § Synthetic.',
      durationMs: Date.now() - startedAt,
    },
  });
}
