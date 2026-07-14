/**
 * BL-032.75 Phase 3 — create Sentry issue-alert Rules 5 + 6
 * (slo-alert page / ticket) via the REST API.
 *
 * The Sentry UI's Tagged-event key combobox only offers already-indexed
 * tag keys, and `severity` has never been emitted, so the rules cannot be
 * built in the UI until the first breach fires. The API has no such
 * constraint. Payload shapes mirror the working Rule 4 (synthetic,
 * id 3508841) read back via the Sentry MCP on 2026-07-14.
 *
 * Auth: $env:SENTRY_API_TOKEN — a USER auth token (Settings → User
 * Settings → Auth Tokens) with scopes: project:read + project:write +
 * org:read. Fails loudly when unset; token never appears in args.
 *
 * Usage: node create-slo-alert-rules.mjs
 */

const ORG = 'gst-7o';
const PROJECT = 'gst-mcp-server';
const BASE = `https://us.sentry.io/api/0/projects/${ORG}/${PROJECT}/rules/`;
// Operator's Sentry user id — read from Rule 4's email action (2026-07-14).
const OPERATOR_USER_ID = 4422941;

const token = process.env.SENTRY_API_TOKEN;
if (!token) {
  console.error(
    "SENTRY_API_TOKEN not set. Mint a User Auth Token (scopes: project:read, project:write, org:read) and run: $env:SENTRY_API_TOKEN = '<token>'"
  );
  process.exit(1);
}

const ruleFor = (severity) => ({
  name: `MCP — SLO alert (${severity} severity)`,
  // Trigger: "A new issue is created" — single trigger, per the per-day
  // fingerprint design (each day's first breach opens a new issue).
  conditions: [{ id: 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition' }],
  actionMatch: 'any',
  // Both tag filters must match.
  filterMatch: 'all',
  filters: [
    {
      id: 'sentry.rules.filters.tagged_event.TaggedEventFilter',
      key: 'event',
      match: 'eq',
      value: 'slo-alert',
    },
    {
      id: 'sentry.rules.filters.tagged_event.TaggedEventFilter',
      key: 'severity',
      match: 'eq',
      value: severity,
    },
  ],
  actions: [
    {
      id: 'sentry.mail.actions.NotifyEmailAction',
      targetType: 'Member',
      targetIdentifier: OPERATOR_USER_ID,
    },
  ],
  frequency: 60, // minutes — per-issue action debounce
  environment: 'production', // evaluator cron is production-only
});

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

for (const severity of ['page', 'ticket']) {
  const payload = ruleFor(severity);
  const res = await fetch(BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`FAILED creating '${payload.name}': HTTP ${res.status}\n${body.slice(0, 500)}`);
    process.exit(1);
  }
  const created = JSON.parse(body);
  console.log(`Created '${created.name}' — id ${created.id}`);
}
console.log('Both rules created. Verify via Sentry → Alerts, or ask Claude to read them back.');
