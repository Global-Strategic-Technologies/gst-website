# Runbook — Compliance audit log (BL-033 Slice 3a)

lastReviewedAt: 2026-08-08

> ⚠️ **DEACTIVATED 2026-08-08 ([ADR-0014](../../../../src/docs/adr/0014-deactivate-audit-pipeline.md))** — the `AUDIT_QUEUE` producer/consumer bindings are removed from `wrangler.toml` in all envs; **no audit entries are captured**. The queues, DLQs, R2 buckets, and `mcp:audit:chain-tip:*` keys are retained for re-enable. This runbook is the re-enable reference; see § Deactivation below for the one-time cleanup and § Re-enable procedure for turning it back on.

The MCP Worker (when the pipeline is bound) writes a **compliance-grade, hash-chained, immutable** record of every tool invocation to R2. Full design + crash-safety rationale: [ADR-0009](../../../../src/docs/adr/0009-compliance-audit-log-hash-chain.md). System overview: [ARCHITECTURE.md § Audit logging](../ARCHITECTURE.md#audit-logging-bl-033-slice-3a).

**Pipeline**: fetch handler enqueues one `AuditEntry` per tool call to `AUDIT_QUEUE` (off the latency path) → the Worker's `queue` consumer (`src/audit/consumer.ts`) sequences it into a SHA-256 hash chain and writes one immutable object to `AUDIT_R2` at `audit/<env>/<yyyy>/<mm>/<dd>/<paddedSeq>.json`. Sequencing state lives in Upstash (`mcp:audit:chain-tip:<env>`, `mcp:audit:seqof:<env>:<entryId>` — the latter with a 30-day TTL since ADR-0014).

> **Not in this slice** (deferred): per-client signed-URL export, the quarterly integrity-check automation, and the `?audit_full_payload=true` full-output retention flag. Audit is captured for `tool_invocation` only.

---

## Deactivation (2026-08-08) — ADR-0014

One-time cleanup after the deactivation deploy, in the decommission-runbook shape of DEPLOY.md § BL-032.8 Phase B. Completion: ✅ **2026-08-08** — production deploy approved, consumers detached (staging + production), 1,798 production `seqof` keys purged (~406 KB reclaimed), production chain-tip verified surviving at `lastSeq: 1797`.

**Prerequisites**

- The deactivation change is deployed to **both** staging and production (staging auto-deploys on merge; production via the `mcp-production` approval). Production keeps writing TTL-less `seqof` keys until its deploy runs — **purge last**.
- Credentials: export `UPSTASH_MCP_REST_URL` / `UPSTASH_MCP_REST_TOKEN` — the values of the Worker secrets of the same names (the **scoped ACL user** for the gst-mcp DB; admin token is break-glass only). Its grant (`+@read +@write +@scripting -@dangerous` on `~mcp:*`, DEPLOY.md § Upstash ACL) covers the script's SCAN + MGET + UNLINK. Never pass credentials as arguments.

**Steps**

1. Confirm the producer is a no-op: purge-script dry-run for a baseline count, make an authenticated `tools/call` against the env, wait ~15 s, dry-run again — the count must be unchanged.
2. Detach the orphaned queue consumer. **Observed on the 2026-08-08 staging deploy**: removing the config blocks detaches the **producer** binding but wrangler does NOT remove the **consumer** subscription — it stays attached to the Worker. Harmless (no producer → no messages) but remove it so remote state matches config: `npx wrangler queues info audit-log-<env>` to confirm, then `npx wrangler queues consumer remove audit-log-<env> <worker>` where `<worker>` is the env's Worker name (`gst-mcp-staging` / `gst-mcp` for production). Staging was detached 2026-08-08 (0 producers / 0 consumers); production needs this after its gated deploy.
3. Purge the leaked ledger keys:
   ```
   cd mcp-server
   npm run purge:audit-seqof                # dry-run report (per-env counts, ~KB held)
   npm run purge:audit-seqof -- --execute   # delete
   ```
   The script never touches `mcp:audit:chain-tip:*` and aborts if the scan surfaces any key outside `mcp:audit:seqof:`. Rerunnable.

**Verify**

- The execute run reports 0 remaining `seqof` keys and prints all three `mcp:audit:chain-tip:{dev,staging,production}` keys (survival proof). **Production must be present**; `dev` and `staging` may legitimately show "(absent)" — the 2026-08-08 purge observed that staging never committed a single audit batch (every ledger key was production traffic), so there is no staging chain to resume.
- Upstash console (gst-mcp DB) storage drops by roughly the dry-run's reported KB.
- `/status` **omits the audit panel entirely** (BL-122). It is gated on `env.AUDIT_QUEUE` being unbound — the same signal the producer gate uses — so a deactivated pipeline is not advertised with a 1970-01-01 last-processed timestamp and zeroed 24h counters. The chain-tip `lastSeq` is still retained in Upstash; it is simply not rendered while the pipeline is off. **On re-enable the panel returns by itself, with no code change** — binding `AUDIT_QUEUE` is sufficient.

**Retained resources — do not garbage-collect**: `audit-log-{dev,staging,production}` + `audit-log-dlq-*` queues (idle queues cost nothing; the re-enable deploy fails without them), the `gst-mcp-audit-*` R2 buckets (immutable history under Bucket Lock), and the chain-tip keys.

## Re-enable procedure

Trigger: the first client whose contract requires compliance audit capture — re-enable **before** kickoff (see PILOT_ONBOARDING.md).

1. **Drain the retained queues + DLQs first.** The 2026-08-08 purge deleted the `seqof` ledger, so a message still resident from before deactivation would re-sequence on delivery as a **duplicate record** (never a chain fork — R2 writes are create-only per `seq`). Draining first makes this a non-event.
2. Revert the ADR-0014 `wrangler.toml` hunk (restores the six producer/consumer blocks). The consumer code, tests, and R2 bindings never left.
3. Re-run § Provisioning **as verification** (the resources should all still exist): `npx wrangler deploy --dry-run --env staging` and `--env production` must resolve the bindings.
4. Deploy via the normal CI/CD path, then run § Verification probe. The chain resumes from the retained `mcp:audit:chain-tip:<env>` tip. Note the consumer now writes `seqof` keys with a 30-day TTL (`SEQOF_TTL_SECONDS`) — the composed main+DLQ retention bound is documented at its definition in `src/audit/consumer.ts`.

---

## Provisioning (one-time per environment) — REQUIRED BEFORE DEPLOY

⚠️ **Sequencing matters.** `wrangler.toml` declares (after the ADR-0014 re-enable revert — today only the `[[r2_buckets]]` half is present) `[[queues.consumers]]`/`[[queues.producers]]`/`[[r2_buckets]]` for `AUDIT_QUEUE`/`AUDIT_R2`. A consumer binding that references a **missing** queue makes `wrangler deploy` fail — and **staging auto-deploys on merge to `master`**. So the staging resources MUST exist **before this PR merges**; the production resources before the production deploy runs.

Do staging first, then production. Non-secret names live in `wrangler.toml` (committed); nothing here is a secret, so **no `wrangler secret put` and no SECRETS_INVENTORY row** (Queue/R2 are bindings; the consumer reuses the existing `UPSTASH_MCP_REST_*` creds).

For `<env>` in `staging`, then `production`:

1. **Create the queue + its dead-letter queue:**
   ```
   npx wrangler queues create audit-log-<env>
   npx wrangler queues create audit-log-dlq-<env>
   ```
2. **Create the R2 bucket:**
   ```
   npx wrangler r2 bucket create gst-mcp-audit-<env>
   ```
3. **Enable retention/immutability** in the Cloudflare dashboard (R2 → `gst-mcp-audit-<env>` → **Settings** → **Bucket lock rules** card → **Add rule**). Cloudflare calls this **Bucket Lock** — it is a standalone retention feature (it does NOT require or depend on object versioning; R2 does not support S3-style "object lock"). It is the load-bearing tamper-evidence control alongside the in-content hash chain.
   - **Prefix**: leave **empty** → the rule covers the whole bucket. This bucket is single-purpose (every object is an audit record under `audit/…`), so whole-bucket is exactly the audit set.
   - **Retention**: **7 years** (as a duration, or an "until" date ~2033; SEC Rule 17a-4 baseline — confirm the exact figure per pilot contract). Locked objects cannot be deleted or overwritten for the retention window; the dashboard disables delete on them.
   - **Object versioning is NOT needed** — the consumer writes create-only (`If-None-Match: *`, one immutable object per `seq`, never overwrites), so versioning would never produce a second version. Bucket Lock + the hash chain are the tamper-evidence. Skip it.
   - Optionally an Object Lifecycle Rule consistent with the retention (bucket-lock rules take precedence over lifecycle deletes, so this is purely documentary here).
4. **Verify the bindings resolve** for that env:
   ```
   npx wrangler deploy --dry-run --env <env>
   ```
   (A missing queue/bucket surfaces here rather than in the live deploy.)
5. **Deploy** — via the normal CI/CD path (staging auto-deploys on merge; production via the `mcp-production` environment approval). **Never** hand-deploy the Worker.

Per-env resource matrix:

| Resource          | staging                 | production                 |
| ----------------- | ----------------------- | -------------------------- |
| Queue (producer)  | `audit-log-staging`     | `audit-log-production`     |
| Dead-letter queue | `audit-log-dlq-staging` | `audit-log-dlq-production` |
| R2 bucket         | `gst-mcp-audit-staging` | `gst-mcp-audit-production` |
| Queue binding     | `AUDIT_QUEUE`           | `AUDIT_QUEUE`              |
| R2 binding        | `AUDIT_R2`              | `AUDIT_R2`                 |

---

## Verification probe (after provisioning + deploy)

1. Make an authenticated **MCP `tools/call`** against the env (any tool, e.g. `list_portfolio_facets`) — `/health` and `/radar/snapshot` deliberately skip the audit path. Give the queue ~10s to flush (5s batch timeout + processing). The first-ever call is `seq 0` (genesis `prevHash` = 64 zeros).
2. Fetch the record from R2 by its deterministic seq key (there is **no** `wrangler r2 object list` — browse the Objects tab in the dashboard for later entries):
   ```
   npx wrangler r2 object get gst-mcp-audit-<env>/audit/<env>/<yyyy>/<mm>/<dd>/0000000000000000.json --pipe --remote
   ```
   (Zero-padded 16-digit `seq`; `<yyyy>/<mm>/<dd>` = the call's UTC date. For later entries, dashboard → R2 → `gst-mcp-audit-<env>` → Objects → the dated prefix → highest `…seq….json`.)
3. Confirm the object is a JSON record with `seq`, `prevHash`, `entryHash`, `keyOwner`, `ipPrefix` (truncated), `toolName`, full `inputParams`, `outputBytes`, `durationMs`, `outcome`, and (for a 2nd+ entry) that its `prevHash` equals the previous seq's `entryHash` (chain continuity).
4. Ops visibility: an `audit_batch` event lands in Analytics Engine (`blob1='audit_batch'`, `blob2='audit-consumer'`) per processed batch — query via `Verify-AeEmission.ps1` if desired.

---

## Failure modes

- **`audit.enqueue_failed` in `wrangler tail`** — the producer's `env.AUDIT_QUEUE.send` rejected both attempts (best-effort; the record was dropped at the first hop — the documented loss window, ADR-0009). Investigate Queue health/quota; a persistent pattern is the trigger to reconsider the fail-closed posture.
- **`audit.consume_failed` + a Sentry `audit consumer batch failed` event** — the consumer threw and `retryAll`'d the batch (nothing acked, nothing dropped). Common causes: Upstash unreachable (the consumer intentionally retries rather than fail-open — a null/down sequencer must never drop a record) or R2 unavailable. The batch retries automatically; after `max_retries` (5) it lands in the DLQ.
- **DLQ (`audit-log-dlq-<env>`) accumulating** — batches that terminally failed. They are **un-chained** (a `seq` gap the deferred integrity check surfaces). Replay: drain the DLQ back onto `audit-log-<env>` (Cloudflare dashboard → Queues → DLQ → requeue, or a small script that reads and re-sends). Because sequencing keys on the stable `entryId`, replayed entries that were already committed are re-projected idempotently (no fork/duplicate); genuinely-new ones append after the current tip. **Two ADR-0014 caveats**: (a) the idempotency window is now bounded by the 30-day `seqof` TTL — safe, since a DLQ message cannot outlive the composed main+DLQ queue retention (≤28 days at platform max); (b) the 2026-08-08 purge deleted all pre-TTL `seqof` keys, so a message enqueued before deactivation and replayed after the purge would re-sequence as a duplicate record — hence the drain-first step in § Re-enable procedure.
- **Chain looks broken on re-walk** — before treating a `prevHash` mismatch as tampering, confirm it isn't a known DLQ `seq` gap (un-replayed terminal failures) rather than a post-hoc edit.

---

## Escalation

Operator (RP). If a pilot client's compliance contract requires **guaranteed capture** (no tool result unless the audit entry is durably enqueued) or **full output-payload retention**, those are the recorded ADR-0009 revisit triggers — schedule the fail-closed `writeAndAwait` seam / the `?audit_full_payload=true` flag as a follow-up slice, don't hot-patch.
