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

export async function dispatchAlertRuleSynthetic(env: Env): Promise<void> {
  const startedAt = Date.now();
  safeLog({
    event: 'alert-rule-synthetic.dispatch',
    success: true,
  });
  await postSentryEvent(env, {
    level: 'info',
    message: 'alert-rule-synthetic: weekly heartbeat',
    tags: {
      event: 'alert-rule-synthetic',
      'alert-rule-synthetic': '1',
      environment: env.ENV_NAME ?? 'unknown',
    },
    extra: {
      source: 'cron.scheduled',
      cron: SYNTHETIC_CRON,
      purpose:
        'Operator-visible weekly proof that BL-047 T1 alert rules + Slack integration are wired. See SENTRY_ALERT_RULES.md § Synthetic.',
      durationMs: Date.now() - startedAt,
    },
  });
}
