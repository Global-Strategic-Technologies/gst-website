# ADR-0014: Deactivate the audit pipeline until the first compliance-requiring client

- **Status**: Accepted (2026-08-08)
- **Source initiative**: operator storage review, 2026-08-08 (Upstash free-tier growth); amends the operational posture of BL-033 Slice 3a / [ADR-0009](0009-compliance-audit-log-hash-chain.md) — which this ADR does **not** supersede

## Context

The BL-033 Slice 3a audit pipeline (ADR-0009: fetch handler → `AUDIT_QUEUE` → `queue` consumer → hash chain → R2) ran in every environment while **no client consumes the audit product** — the MCP has no adopted customers, and the deferred slices (signed-URL export, integrity-check automation) were never built because nothing pulls them.

Meanwhile the pipeline's sequencing ledger wrote one `mcp:audit:seqof:<env>:<entryId>` key (~210 B) per tool call to the shared `gst-mcp` Upstash DB with **no TTL** — the only unbounded key family in that DB (~800 KB accumulated, ~0.3% of the 256 MB free tier, growing with every call). ADR-0009 had already ratified a `seqOf` TTL as design intent ("should carry a TTL longer than max queue retention") that was never implemented. Beyond storage, every tool call burned queue operations, Redis commands, and R2 writes for a feature with zero consumers.

## Decision

**Deactivate the pipeline config-only; keep everything needed to turn it back on with a revert.**

1. **Unbind the queue** in all envs: the `[[queues.producers]]` / `[[queues.consumers]]` blocks are removed from `mcp-server/wrangler.toml`. The producer gate (`env.AUDIT_QUEUE ? … : undefined` in `handle-authenticated.ts`) makes the entire audit path a no-op — **zero code deleted**; the `queue` handler export and all 31 audit tests remain.
2. **Retain the resources**: the Cloudflare queues (`audit-log-{dev,staging,production}`) and their DLQs stay provisioned (idle queues cost nothing; a consumer block referencing a deleted queue fails deploy). The R2 buckets stay bound (they hold the immutable historical chain under the 7-yr Bucket Lock rule set per AUDIT_LOG.md). The two `mcp:audit:chain-tip:<env>` keys stay in Upstash (~300 B) so a re-enabled chain resumes unbroken.
3. **TTL-harden the ledger** (the ADR-0009-ratified hardening): `seqOf` writes now carry `SEQOF_TTL_SECONDS` (30 days). The safety bound **composes**: a message can sit out the main queue's retention, land in the DLQ, and sit out the DLQ's retention before manual replay — 14 + 14 = 28 days at the Cloudflare platform maximum, 4 + 4 = 8 days at our unset defaults. 30 days clears the platform max; do not lower it toward the single-queue 14-day figure. Dormant while the pipeline is off (pinned by a unit assertion in `consumer.test.ts`); its value is that re-enabling cannot recur the leak.
4. **Purge the backlog**: the pre-TTL `seqof` keys are reclaimed by the tested operator script `mcp-server/scripts/purge-audit-seqof.mjs` (dry-run by default, `--execute` to delete, never touches chain-tip keys; runbook in AUDIT_LOG.md § Deactivation).

**Rejected alternatives:**

- **TTL-only, pipeline stays live** — bounds storage at a trivial steady state but keeps burning queue/Redis/R2 operations for a product nobody consumes; the compliance "guarantee" it sustains was an overclaim for a feature with no contracted client.
- **Rip the audit code out** — maximum savings, but destroys the ADR-0009 investment and turns a future compliance requirement into a rebuild instead of a config revert.
- **Delete the queues/DLQs/chain-tips too** — saves nothing (idle resources are free) and breaks the config-revert re-enable path.

## Consequences

- **Code/docs that cite this decision**: `mcp-server/wrangler.toml` (audit comment blocks), `src/worker.ts` (Env + queue-handler comments), `src/audit/consumer.ts` (`SEQOF_TTL_SECONDS`), `src/observability/status-page.ts` (audit-panel annotation), `scripts/purge-audit-seqof.mjs`, AUDIT_LOG.md (deactivation banner + runbook), ARCHITECTURE.md § Audit logging, PILOT_ONBOARDING.md (audit guarantee rewritten as deactivated-capability), STATUS_PAGE.md, and the BL-033 stanza dispositions in BACKLOG.md.
- **Client-facing posture**: the audit trail is a **capability, not a live guarantee**. Onboarding materials must not promise active capture; a contract requiring it triggers re-enable _before_ kickoff.
- **The purge sacrifices redelivery idempotency for resident messages**: any message still sitting in the retained queues/DLQs when the `seqof` ledger is purged would, on later redelivery, re-sequence under a fresh `seq` — a **duplicate record**, never a chain fork (R2 writes are create-only per `seq`). Re-enable therefore **drains the queues/DLQs first** (AUDIT_LOG.md § Re-enable), making this a non-event.
- **Status page**: the audit panel stays, annotated "Pipeline deactivated 2026-08-08"; `lastSeq` shows the historical chain tip, 24 h batch counters decay to zero. No alert rules referenced audit, so deactivation pages no one.
- **Revisit trigger (re-enable)**: the first client whose contract requires compliance audit capture. Procedure: drain the retained queues/DLQs → revert this change's `wrangler.toml` hunk → re-verify per AUDIT_LOG.md § Re-enable (the ADR-0009 revisit triggers — fail-closed capture, full-payload retention, integrity automation — then re-apply as written).
