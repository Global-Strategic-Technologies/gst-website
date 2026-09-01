# BL-133 — Payments Platform: automated MCP access checkout

> **Status**: designed and reviewed — **not implemented**. Implementation deferred by operator
> decision 2026-09-01.
> **Scope**: this document is the controlling design for BL-133. The acceptance criteria live in the
> [BL-133 stanza](BACKLOG.md#bl-133-payments-platform--automated-mcp-access-checkout-on-cloudflare),
> which this design satisfies or explicitly deviates from; it does not restate them.
> **Provenance**: eight adversarial review rounds via the `plan-reviewer` gate (Directive 2), final
> verdict APPROVE with zero blockers. The passages marked _an earlier revision …_ record designs that
> looked correct and were not — they are kept so the same mistakes are not re-derived.
> **Blocked on**:
> [BL-145](BACKLOG.md#bl-145-design-partner-program--set-the-price-from-evidence-not-from-a-guess)
> for Slice 4 — it owns the price, and its stated purpose is to stop a low number being published,
> which cannot be walked back. **No price figure in this document is authoritative.**
> **First task for whoever picks this up**: § Vendor behaviour: documented, not executed. The
> lifecycle rests on Stripe behaviour inferred from docs and never exercised.

## Context

Today a prospective MCP client clicks a prefilled `mailto:` on `/hub/mcp/` and waits for the
operator to run `provision-client.mjs` by hand. BL-133 is the operator's 2026-08-15 go-decision to
replace that with a card purchase that provisions credentials automatically — built as a **payments
capability whose first product is MCP access**, not an MCP feature that takes money.

The substrate exists and must not be rebuilt: per-client tiers (`mcp-server/src/ratelimit/tiers.ts`,
ADR-0010), M2M `client_credentials` with hashed secrets (`src/oauth/m2m-clients.ts`), the admin API,
per-`keyOwner` telemetry. What is missing is the money and the automation around it.

### Decisions taken (operator, 2026-09-01)

| Decision             | Choice                                                                                                                       | Consequence                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rail + tax liability | **Stripe with Managed Payments**                                                                                             | Stripe/Link is merchant of record, so GST carries no VAT, sales-tax or GST-equivalent registration, filing or remittance obligation across 80+ countries. Costs 3.5% on top of standard processing. Operator rationale: at low volume the regulatory overhead of being MoR costs more than the fee.                                                   |
| Self-serve SKU       | **`paid` / "Deal Team" only**                                                                                                | One SKU, one fulfillment handler. Pilot stays request-based, Firm stays negotiated. Radar scopes excluded.                                                                                                                                                                                                                                            |
| Price                | **Not set here — [BL-145](BACKLOG.md#bl-145-design-partner-program--set-the-price-from-evidence-not-from-a-guess)'s output** | BL-145 owns the number and **blocks Slice 4**: the purchase surface cannot display a price that item has not produced. Its recorded hypothesis is an internal list price of **$18–24k/yr** for `paid`, deliberately unpublished, on the basis that the buyer is a PE/corp-dev deal team, not a per-seat SaaS user. Take no figure from this document. |
| Branch               | **`feat/mcp-website-marketing`, directly**                                                                                   | Asked for and reaffirmed at design time, against Directive 13's one-branch-one-concern rule. **Re-confirm before implementing**: that branch will likely have merged by then, in which case the work cuts from `master` as normal and this decision lapses.                                                                                           |

### Why Managed Payments removes most of the build

- **No checkout-creation endpoint.** It works with **Payment Links**, so the CTA is a plain
  `<a href="https://buy.stripe.com/…">`.
- **No Stripe API calls from the Worker → no Stripe API key.** Only a webhook signing secret.
- **No email vendor.** Stripe sends receipts, invoices, refund notices and renewal reminders from
  Link. GST sends no email in v1 — the BL-004 overlap drops out.
- **No dunning logic.** Stripe retries failures and ends in `customer.subscription.deleted`.

Net: **one webhook endpoint, one Worker page, seven subscribed event types.**

---

## Slice 1 — Vendor decision → ADR-0027

Write `src/docs/adr/0027-payments-rail-stripe-managed-payments.md` per
[TEMPLATE.md](../adr/TEMPLATE.md) with the four-vendor matrix (Stripe direct, Stripe Managed
Payments, Paddle, Polar) on BL-133's axes, the tax axis recorded as **the** decision, and the
operator's low-volume rationale quoted. Must carry:

- **Switch trigger**: revisit if volume makes 3.5% exceed self-managed registration + filing cost,
  or if a buyer refuses "Sold through Link" as merchant of record.
- **Accepted costs**: buyer sees _Sold through Link_; statement descriptor `LINK.COM*`; no custom
  checkout domain; Stripe may refund without approval if a support escalation goes unanswered 48h.
  Every vendor figure in this document — that 48h, the 300s signature tolerance, the three-day retry
  window, the 15/30-day resend limits — is **read from Stripe's docs, not exercised**, and inherits
  the caveat below.
- **`workerd` verification**: no SDK is bundled, so the vendor-SDK risk is retired by construction —
  signature verification is Web Crypto only.
- **Slice 5 second consumer scored now**: engagement invoices want ACH/wire and POs, where a
  percentage MoR fee is punitive. Same Stripe account, same webhook, Stripe Invoicing **without**
  the `managed_payments` flag — a per-transaction choice. This is what makes the rail reusable.
- The Worker-hosted return page, the audit decision, and the deliberate deviation from Stripe's
  async-queue guidance — all three depart from a stated default and belong in the record.

Update **`src/docs/adr/README.md`** (a row per ADR through 0026) in the same commit.

Amend **ADR-0008** in the same PR as Slice 3: post-payment provisioning is a bounded exception — the
operator's checkout is the registration authority, so it is not DCR, and no user directory or public
registration endpoint appears. Amendment section; do not supersede.

### Vendor behaviour: documented, not executed

Stripe's Managed Payments docs state you "can issue refunds and **update subscriptions** in the
Dashboard or with the API", and its data-deletion section enumerates Subscription, Customer,
Invoice, PaymentIntent and Charge objects as living **in your Stripe account**. Good evidence that
standard Billing webhooks still fire under MoR — but an inference from docs, not something the
design session executed. **Treat the whole lifecycle as unverified until the staging exercise proves it**;
do not write "confirmed" into the ADR before then. Riding along: that Payment Link `metadata`
propagates to the Checkout Session, and that Payment Links support a completion redirect carrying
`{CHECKOUT_SESSION_ID}`. All are checked in one staging pass; the SKU lookup is one function, so if
metadata does not propagate the fallback is to key off the Payment Link id in the event.

---

## Slice 2 — Webhook rail on the Worker

**New files under `mcp-server/src/payments/`:**

- **`stripe-signature.ts`** — verify `Stripe-Signature` (`t=…,v1=…`). Signed payload is
  `` `${t}.${rawBody}` ``, HMAC-SHA256 hex, compared with `timingSafeEqual`
  (`src/auth/timing-safe-equal.ts`), plus a 300s window (Stripe's own default tolerance; **never 0**,
  which disables the recency check). **Hoist `hmacKey()`** out of `src/oauth/m2m-token.ts:76` into
  `src/lib/` rather than copying it — `sha256Hex` set exactly that precedent when a non-OAuth module
  became its second consumer (`m2m-clients.ts:28-31`).
  Three details from Stripe's manual-verification spec that are easy to get wrong: **ignore every
  scheme that is not `v1`** (`v0` is sent for test events; honouring it is a downgrade attack),
  compare against **every** `v1` in the header (rolling a signing secret produces one signature per
  active secret for up to 24h), and note Stripe re-signs with a fresh `t` on each retry.
  **No new dependency.**
- **`idempotency.ts`** — **Upstash `SET … NX EX`** via `createMcpClient`
  (`src/lib/upstash-clients.ts:64`), key `mcp:pay:event:<eventId>`. KV is eventually consistent
  across colos on the order of tens of seconds — inside Stripe's retry timing — so KV get-then-put is
  the wrong substrate. Do **not** use `single-flight-lock.ts`'s `acquire()`: its fail-open-on-error
  behaviour is a wrapper property that is wrong for a charge. **Calling Upstash directly does not by
  itself avoid failing open** — `createMcpClient` returns `Redis | null`, and it is
  `single-flight-lock.ts:68-69` turning that `null` into `return true` that makes the wrapper fail
  open. State it in this module: **a null client is a 500 and never proceeds to fulfilment.**
- **`webhook.ts`** — reads the raw body **once** with `await request.text()` before any JSON parse
  (the `m2m-token.ts:276-281` pattern), verifies, leases, dispatches via the SKU catalog.
- **`skus.ts` / `catalog.ts`** — see Slice 5.

### Durability

BL-133 requires the handler to "return 2xx fast and do provisioning work durably". Provision
**synchronously, before returning 2xx** — not in `ctx.waitUntil`, which is not durable: an eviction
after a 2xx loses the work and Stripe never retries, so a paying buyer silently gets nothing.
**Stripe's own retry is the durability mechanism**: it retries non-2xx "for up to three days with
exponential back off in live mode" (sandbox: three attempts over a few hours), plus Dashboard resend
for 15 days and `stripe events resend` for 30.

Stripe's docs recommend an async queue and a fast 2xx. **We deliberately do the opposite**, because
at this volume correctness beats throughput and the only durable queue here (the ADR-0009 pipeline)
is deactivated. Record the deviation and its revisit trigger — sustained webhook bursts, e.g. many
subscriptions renewing the same day — in ADR-0027. Stripe publishes **no numeric endpoint timeout**,
so **do not cite one**: bound the budget by measurement and record the observed p99 from staging.
The workerd side is not at risk — fulfilment is under ten subrequests against a 1000 ceiling, and
HMAC-SHA256 over a small body is negligible CPU.

### The event lease — two-phase, branching on value

1. `SET NX mcp:pay:event:<eventId> = "lease" EX 300` (same worst-case-fulfilment reasoning as the
   session lease below — a 60s lease is shorter than a brownout).
2. If the write did **not** land, `GET` and branch on the **value**: `completed` → 200 no-op; a live
   `lease` → **409** so Stripe retries later; absent (lease expired mid-flight) → proceed.
3. Fulfil (below).
4. On success, overwrite with `completed` at a 30-day TTL. **On failure, `DEL` the lease and return 500.** The `DEL` can itself fail — that is what the short lease TTL is for, and it is deliberate:
   a lost `DEL` costs one delayed retry, not a swallowed provision.

A single-phase "write a long key first, return 200 if present" would leave the key in place after a
failed fulfilment and short-circuit every retry to 200, permanently swallowing the provision.
Branching on presence alone is also unsafe under concurrent redelivery. **The event lease is not the
only guard**: Stripe warns it sometimes emits **two distinct Event objects for one occurrence**,
which no event-id key can dedupe — the session gate below is what covers that.

### Routing

Add a branch in `mcp-server/src/worker.ts` **after** the `/admin/inoreader/reauth/*` pair
(`:460-473`) and **before** the `isRoutedPath` gate (`:485`), matching that pair's precedent of a
non-MCP, non-OAuth endpoint owning its own auth. It must stay after `resolveHostRoute` (`:383-386`) —
`tests/unit/dispatch/host-route.test.ts:98-114` asserts source order.
Paths: `POST /payments/webhook/stripe`, `GET /payments/complete`.

### Abuse surface

Both paths are public and sit ahead of the per-key rate limiter. **Do not add IP rate limiting to
the webhook.** There is no IP-based limiter in this repo (`src/ratelimit/limiter.ts` is a per-key
sliding window; `CF-Connecting-IP` appears only as a truncated logging value at
`pipeline/handle-authenticated.ts:242` and `audit/redaction.ts:23`), and it is the wrong control:
Stripe delivers from a small published IP pool, so any limit tight enough to matter throttles Stripe
during a renewal burst — manufacturing the retry storm the AC forbids. Instead:

- **Body-size cap of 256 KB** (`Content-Length` check plus a bounded read) before HMAC work, with a
  named test.
- **Stripe IP allowlist as a Cloudflare WAF rule, not application code.** A list hardcoded in the
  Worker goes stale silently and then fails **closed against real Stripe traffic** — the worst
  direction for this endpoint. The WAF puts staleness in one operator-visible place and leaves the
  signature as the in-code control that cannot rot. Document the rule, its refresh trigger and its
  owner in `src/docs/security/SECURITY_HEADERS.md` (a network control belongs there, not in
  `SECRETS_INVENTORY.md`, which is a secrets doc).
- **`/payments/complete`** is protected by `session_id` entropy, the 900s handoff TTL and
  burn-on-read. If abuse appears, a limiter is a follow-up with a named primitive.
- **Stripe Radar** is the card-testing control on the Payment Link, and pilot ceilings stay low
  enough that a farmed credential is not worth having.

### Secret

`STRIPE_WEBHOOK_SECRET?: string` in `mcp-server/src/env.ts` (~`:110`, beside
`OAUTH_M2M_SIGNING_KEY`), added to **both** prose secret manifests in `wrangler.toml` (staging
`:152-173` **and** the production block from `:231`), and a row in
`src/docs/operations/SECRETS_INVENTORY.md`. Staging points at Stripe **test mode** with its own
distinct signing secret.

### Audit decision (explicit, as the AC demands)

**Do NOT re-enable the ADR-0009 pipeline.** It is deactivated per ADR-0014 and writing to it writes
to a dead sink. ADR-0014's re-enable trigger is "the first client whose contract requires compliance
audit capture" — a self-serve card purchase is not that client. Provenance is recorded **on the
client record** instead, with `safeLog` and Analytics Engine covering operational traceability.
State this in ADR-0027 so it cannot drift.

---

## Slice 3 — Automated enablement

### Blocker first — `PATCH /admin/oauth/m2m-clients/:id`

The admin API is GET/POST/DELETE only (`src/admin/oauth-clients.ts:154-257`), so a tier change today
means delete-and-recreate, i.e. a new credential. Add PATCH (tier + scopes) plus `updateM2mClient()`
in `src/oauth/m2m-clients.ts`. `requireAdmin`-gated; validate tier through `isAssignableTier` exactly
as POST does at `:200-208`; `Allow: DELETE, PATCH` on the item route. BL-133 says "audit-logged", and
the pipeline is dead, so that means a **`safeLog` event** mirroring the create/delete siblings at
`:215-220` / `:246-251`. Dispatch needs no `worker.ts` change — `oauth/default-handler.ts:31-32`
prefix-matches `/admin/oauth/m2m-clients`.

**The webhook provisions through the library functions, not its own HTTP endpoint** —
`createM2mClient` / `updateM2mClient` / `deleteM2mClient` called directly. A self-directed subrequest
would require binding `MCP_ADMIN_KEY` into the payments path and add a network hop inside the
fulfilment budget for no gain.

### Payment provenance on the record

`M2mClientRecord` (`m2m-clients.ts:44`) is a closed 7-field interface. Add one optional field:

```ts
payment?: {
  provider: 'stripe';
  customerId: string;
  sessionId: string;
  subscriptionId?: string;
  sku: string;
  firm?: string;        // buyer-supplied, provenance only — never the keyOwner
  recordedAt: string;
};
```

Thread through `CreateM2mClientInput`, `createM2mClient`, the POST parse (`:179-214`) and both
projections (`:168-175`, `:222-234`). No card data ever reaches KV.

### Payment is not identity

- **Stripe/Link verifies the email** at checkout; a required **"Firm" custom field** on the Payment
  Link captures the organisation. Both land in the `payment` blob.
- **Terms acceptance at checkout replaces the executed NDA + DPA** that `PILOT_ONBOARDING.md` § 0
  requires for operator-provisioned clients. Say this explicitly in the § 0 rewrite and in `/terms/`
  — it is a real reduction in what GST holds before granting access, and the reason the self-serve
  SKU is `paid` only, radar excluded, enterprise still a conversation.
- **The client `name` is machine-generated, never buyer input**: `selfserve-<8 hex of customerId>`.
  Load-bearing, not cosmetic: `src/oauth/key-owner.ts:27-32` turns `name` into the `keyOwner` that is
  simultaneously the rate-limit bucket, the AE `blob3`/`index1` value the traffic-spike alert
  evaluates per-keyOwner, and a `safeLog` field — under a docblock stating cardinality "should stay
  roster-sized". Buyer-controlled names would make that unbounded. The firm name lives in provenance
  and is never an index.

### Shared guardrails — extract to `.ts`, keep one CLI mirror

The Worker must not import `provision-client.mjs`. The file _is_ import-safe (its `isMain` guard at
`:389-391` means importing triggers no CLI side effects), but computing that guard reads
`process.argv[1]` **at module top level**, which would drag a `process` access into the Worker bundle
against ADR-0020.

**Extract to `mcp-server/src/provisioning/guardrails.ts`** — plain TypeScript, imported directly by
the fulfilment handler. A `.mjs` would resolve and bundle correctly but would land the one new module
on the money path outside every guard the repo has: `eslint.config.mjs` scopes its mcp-server blocks
to `mcp-server/src/**/*.{ts,mts}` (`:238`, `:390`), so a `.mjs` loses both the ADR-0020
`no-restricted-globals` ban on `process`/`Buffer`/`global` and the ADR-0004 `no-restricted-imports`
rule, and instead matches the generic `**/*.{cjs,mjs}` Node-script block at `:116` — **the one scope
that declares `process` as a readonly global**, i.e. exactly what the extraction exists to prevent.
Compounding it, `mcp-server/tsconfig.json` sets no `allowJs`, so `src/**/*.mjs` is never type-checked,
and `vitest.config.ts` coverage `include: ['src/**/*.ts']` would leave it outside the 70% threshold.
`.ts` keeps type-check, coverage and Worker-safety lint on the money path and **avoids editing
`eslint.config.mjs`**, which would otherwise be a blocking Directive 14 obligation to update
`DEVELOPER_TOOLING.md`.

The cost is one mirror: `provision-client.mjs` keeps its frozen arrays, because a Node CLI cannot
import TS. That is the repo's existing, tested pattern. **Extend
`tests/unit/scripts/provision-client.test.ts`** to bind the mirrors to `guardrails.ts` as well; its
bindings to `tiers.ts` and `provider.ts` are untouched. `assertAssignableTier` is **new**, not lifted:
the tier check today is inline in `parseArgs` (`:126-135`) with CLI-specific message text.

The two properties this protects, which the handler must not reimplement: an explicit tier (the API
silently resolves an absent one to `free-pilot`, `m2m-clients.ts:80`) and scope-catalog validation
(the API accepts any non-empty array, so a typo provisions a client that can call nothing). Assert in
the SKU test that no catalog entry contains `tool:radar:*` or `resource:radar:read` — checkout must
not become the `--allow-radar` bypass.

### Keys

Every `mcp:pay:*` key lives in **Upstash** (`createMcpClient`, `src/lib/upstash-clients.ts:64`) — not
KV. That matters: `SADD` forces Upstash anyway, and the KV-consistency argument for rejecting KV as
the idempotency substrate applies to all of them. The **client record itself** is the one thing in
`OAUTH_KV`, written by `createM2mClient` at `mcp:oauth:m2m-client:<clientId>`.

| Key                                | Store   | Value                                                                         | TTL        | Purpose                                                       |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------- |
| `mcp:pay:event:<eventId>`          | Upstash | `lease` → `completed`                                                         | 300s → 30d | Event-delivery lease                                          |
| `mcp:pay:session:<sessionId>`      | Upstash | `{state:'creating'}` → `{state:'creating', clientId}` → `{outcome, clientId}` | 300s → 90d | **Session lease, re-entry evidence and page state — one key** |
| `mcp:pay:handoff:<sessionId>`      | Upstash | credentials → `claimed`                                                       | 900s → 30d | One-time secret, then tombstone                               |
| `mcp:pay:customer:<customerId>`    | Upstash | `clientId`                                                                    | none       | Customer → client spine                                       |
| `mcp:pay:charge:<chargeId>`        | Upstash | `customerId`                                                                  | 540d       | Dispute → customer                                            |
| `mcp:pay:subs:<clientId>`          | Upstash | set of subscription ids                                                       | none       | Active-subscription count                                     |
| `mcp:pay:subdead:<subscriptionId>` | Upstash | `1`                                                                           | 30d        | Dead-subscription tombstone                                   |
| `mcp:pay:revoked:<customerId>`     | Upstash | `1`                                                                           | 30d        | Marks a mapping miss as _expected_ after revoke               |

`outcome` is one of `provisioned` \| `restored` \| `duplicate` \| `cancelled`, which is what lets the
return page distinguish its terminal states from one key.

**The session key is a lease, not a marker, and it does three jobs at once.** An earlier revision made it
a plain read at step 1 of a key written at step 6 — which left the _entire fulfilment_ as a gate
window: two overlapping deliveries for one session both read absent, both provision, and one client is
orphaned at `paid` with no signal. That needs no Stripe pathology to reach, because
`checkout.session.completed` and `checkout.session.async_payment_succeeded` are two events deliberately
routed down the identical path for one session. Making it a lease closes that, and it also **subsumes
the separate creation marker** an earlier revision carried: a `creating` value that has acquired a
`clientId` _is_ the durable re-entry evidence, so one key replaces two and the TTL-asymmetry problem
disappears with it.

### Fulfilment

**Subscribed events (seven).** `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`charge.succeeded`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`.

The async pair is not optional. `checkout.session.completed` can arrive with
`payment_status: 'unpaid'` for asynchronous payment methods, and the Managed Payments/Link rail does
not guarantee card-only methods. **Provision only on `payment_status === 'paid'`** — but a gate
without its companion event would mean an async payment that later settles is charged and never
provisioned, with no signal. So `async_payment_succeeded` runs the identical fulfilment path, and
`async_payment_failed` logs and raises an operator signal.

**Write order. The session marker is written LAST, and the handoff immediately after creation:**

1. **Acquire the session lease**: `SET NX mcp:pay:session:<sessionId> = {state:'creating'} EX 300`.
   If it did not land, `GET` and branch on the value — this is the gate, and it is what makes Stripe's
   duplicate _Event objects_ and the completed/async-succeeded pair harmless:
   - `{outcome, …}` → **200 no-op**, the work is done.
   - `{state:'creating'}` with **no** `clientId` → **409**; another delivery is mid-flight, or one
     died before creating anything. The pre-promotion TTL self-heals that case.
   - `{state:'creating', clientId}` → **repair forward** (below). Never re-create, never rotate.
2. Check `payment_status` (or accept the async-success event).
   2b. **Check `mcp:pay:subdead:<subscriptionId>` for this session's subscription, before the branch
   decision.** Present → this checkout is for a subscription Stripe has already deleted: delete the
   tombstone, write `outcome: 'cancelled'` **at 90d, matching every other outcome**, raise an operator
   signal, and stop. Do not provision, do
   not restore.
3. Resolve the client (rules below) and branch (table below).
4. On the provision path: `createM2mClient` → **immediately** `SET mcp:pay:session:<sessionId> =
{state:'creating', clientId} EX 90d`, which promotes the lease into durable re-entry evidence →
   write the handoff key → write the customer mapping.
5. `SADD` the subscription id to `mcp:pay:subs:<clientId>` (the subdead tombstone was already
   consumed at step 2b, so no guard is needed here).
6. **Overwrite the session key with `{outcome, clientId}` at 90d, last.**
7. On any failure before step 4's promotion, `DEL` the session lease and return 500 so the retry can
   proceed cleanly. After promotion, leave it: it is the evidence.

**Why the outcome is written last, and why the lease is taken first.** Two separate lessons, both
learned the hard way in review. Writing the outcome early and gating on it meant a failure between
the gate write and the handoff write produced a retry whose first act was to no-op — a live
subscription, no credential, no recovery. Reading rather than leasing meant concurrent deliveries
could both pass the gate. A lease acquired first and resolved last is the only shape that closes both.

The 300s→90d promotion is the same two-phase idea as the event lease: short while nothing irreversible
has happened, durable the moment a client exists. **Do not shorten the promoted TTL below Stripe's
three-day retry window** — evidence that expires inside it is what caused an earlier revision to mint a
second client for the same session.

**The pre-promotion TTL must exceed worst-case fulfilment, and 60s does not.**
`src/lib/upstash-clients.ts:31-48` documents the SDK default as six fetch attempts totalling
**4,289ms of sleeps per call**; fulfilment makes roughly nine Upstash calls, so a brownout burns ~40s
in sleeps alone before any network time — and a brownout is exactly when the lease matters. If
fulfilment outlives the lease, a later delivery `SET NX`s an absent key and provisions a second
client: the same silent duplicate, by a different route. Hence **300s**, and hence: **pass the
documented BL-121 `retry: false` on the money path.** Our durability story _is_ Stripe's retry, so
spending 4.3s per call papering over a brownout is the wrong trade — fail fast, return 500, let
Stripe redeliver. A generous lease costs only a longer 409 for a died-mid-flight delivery, which
costs nothing. Record the observed fulfilment p99 in the staging step and revisit the number against
it rather than leaving it a guess.

**Client resolution — three outcomes, not two.** Read `mcp:pay:customer:<customerId>`, then:

- **No mapping** → no client.
- **Mapping present, `getM2mClient` returns a record** → that client.
- **Mapping present, `getM2mClient` returns `null`** → **stale mapping**: delete it, `safeLog` and
  raise an operator signal, then proceed as _no client_. This state is reachable whenever a record is
  deleted but its mapping is not — an operator `DELETE /admin/oauth/m2m-clients/:id`, or any revoke
  path. Without the fall-through, a re-purchase resolves to a dead `clientId` and loops on 500 until
  Stripe gives up after three days: paid, no credential, no signal.

The **stale-`clientId` branch of repair-forward** (a promoted lease naming a record that is gone) is
the same anomaly class and gets the same treatment: `safeLog` plus an operator signal before falling
through to provisioning. An anomaly worth a signal in one path is worth one in the other.

**Repair forward** (the `{state:'creating', clientId}` branch): re-read the client record for that
`clientId`; if it is gone, treat it as a stale reference and fall through to provisioning. Otherwise
write whatever is missing — customer mapping, `SADD`, the final outcome — and return 200. If the
handoff key is absent and no tombstone exists, the handoff write itself failed: **raise an operator
signal** and let the page render the recovery state, since the secret cannot be re-derived and must
not be rotated.

The handoff key **cannot** serve as this evidence: its TTL is 900s and the tombstone only exists if
the buyer rendered the page, whereas Stripe retries for three days. Any failure not resolved within
fifteen minutes would leave no trace, and the retry would mint a _second_ client — orphaning the
first with no mapping, permanently `paid`, and unreachable by every lifecycle event.

**Residual, stated precisely.** The orphan window is now the single write between `createM2mClient`
and the lease promotion — bounded, not unbounded. **That window must emit its own operator signal**
from the failure path at step 7, not only from the test list. Such a record is
inert **for authentication only**: nobody holds its secret, so it never authenticates, emits no
traffic, and occupies no rate-limit bucket or AE row (which is why the shared `keyOwner` with the
retry's client is not an alerting problem). It is **not** invisible: `listM2mClients`
(`m2m-clients.ts:100-113`) and the `GET` projection (`oauth-clients.ts:165-176`) return every record,
so it shows in the operator roster as a `paid` client — and `rotateSecret` on the admin PATCH endpoint
would turn it into a live `paid` credential attached to no payment. So pruning is a **named
procedure** in `PILOT_ONBOARDING.md`, with the identifying signature: a `paid` record whose
`payment.customerId` is set and which no `mcp:pay:customer:` mapping points at.

**Branch table.** Every branch writes the session marker; only the first writes a handoff.

| Situation                          | Action                                                | `outcome`     | Page state                    |
| ---------------------------------- | ----------------------------------------------------- | ------------- | ----------------------------- |
| No client (incl. stale mapping)    | Provision; promote the lease; write handoff           | `provisioned` | Secret, once                  |
| Client exists, tier demoted        | PATCH tier → `paid`; **no rotation**                  | `restored`    | Access restored, client id    |
| Client exists, tier already `paid` | No provisioning; `SADD`; **raise an operator signal** | `duplicate`   | Already active + refund route |

**The webhook never rotates a secret, in any branch.** For a `client_credentials` client the secret
_is_ the configuration, so rotating it on a repeat event would break a running pipeline the instant
it landed, and the buyer would only learn the new secret by following the redirect — close the tab
and the integration is dead and unrecoverable. Stripe's duplicate-Event behaviour makes it worse: one
purchase could rotate twice and hand over an already-stale secret. This applies to the demoted branch
too: a demoted client is usually still running — the tier changed, the secret did not.

`rotateSecret` stays available as a parameter on `updateM2mClient` for **operator-invoked** use (the
right tool for a suspected compromise and for the lost-secret recovery route), and the admin PATCH
endpoint should expose it as a flag for that purpose. No webhook path calls it. Residual worth
stating: M2M access tokens are self-contained, so tokens minted under an old secret stay valid until
expiry (~1h per the `PILOT_ONBOARDING` revoke note) — rotation is not instant revocation.

**Mechanise the no-rotation invariant rather than asserting it.** The repo already enforces
"who may call what" structurally — `eslint.config.mjs:238`/`:390` `no-restricted-imports`, and
`tests/integration/radar-store-callers-breaker-gated.test.ts`, which asserts that any module importing
the fetch-capable readers also imports the breaker check. Add the equivalent: **no module under
`src/payments/` may reference the rotate capability**, so a future edit fails a test rather than a
review.

**The duplicate branch takes money — so it must be visible and terminal.** A buyer who never saw
their secret may reasonably re-purchase, creating a second subscription billed monthly for nothing.
That branch therefore writes `outcome: 'duplicate'`, raises an operator signal (`captureMessage` with
a stable fingerprint, the `worker.ts:553-562` pattern), and the page routes to the refund/recovery
contact — **never to "Check again"**, which would loop after a second charge.

### Lifecycle

| Event                                                    | Action                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed` / `async_payment_succeeded` | Fulfilment above                                                                                                                                                                                                                                                                                                                                                                                  |
| `checkout.session.async_payment_failed`                  | Log + operator signal; nothing provisioned                                                                                                                                                                                                                                                                                                                                                        |
| `charge.succeeded`                                       | Write `mcp:pay:charge:<chargeId>` → `customerId` (540d)                                                                                                                                                                                                                                                                                                                                           |
| `customer.subscription.deleted`                          | Resolve customer → client (below); `SREM`; **demote to `free-pilot` only if the set is now empty**                                                                                                                                                                                                                                                                                                |
| `charge.refunded`                                        | **Only when the Charge's `refunded` flag is `true`** (full refund): resolve charge → customer → client; if `SCARD` of the subs set is > 1, **raise an operator signal first**; then revoke via `deleteM2mClient`, delete the customer mapping, delete the subs set, and write `mcp:pay:revoked:<customerId>` (30d). A **partial** refund logs, raises an operator signal, and **changes nothing** |
| `charge.dispute.created`                                 | Identical (a dispute is never partial in this sense), resolved through the charge mapping since a Dispute carries no customer                                                                                                                                                                                                                                                                     |

**Partial refunds must not revoke.** Stripe emits `charge.refunded` for partial refunds too — the
Charge carries `amount_refunded < amount` with `refunded: false` — so an unguarded rule would let a
$20 goodwill credit against a $400 charge run `deleteM2mClient`, destroy the buyer's only credential
and break a running pipeline, recoverable only through the manual rotate-and-hand-over path. "Money
returned means access ends" is right for a full refund and wrong for a partial one.

**The multi-subscription signal is the safety valve for choosing bluntness over arithmetic**, so it
has to actually exist rather than live in this paragraph: a customer refunded on one of two active
subscriptions is still paying, and revoking them silently is the failure the operator must see. Raise
it on `SCARD > 1` **before** the delete, and assert it.

**Refund and dispute revoke outright; they do not touch the subscription set.** An earlier revision had
them `SREM` and revoke-if-empty — but **neither event carries a subscription id**. A Stripe Charge
carries `customer`, `invoice` and `payment_intent`; a Dispute carries less. Resolving charge →
invoice → subscription is an API retrieve, exactly the move the charge mapping exists to avoid. So
that `SREM` would have removed nothing, the set would never empty, the revoke branch would never
fire, and a refunded or charged-back buyer would keep `paid` access indefinitely.

The fix deletes a dependency rather than adding an eighth event: **money returned means access ends.**
The subscription set governs only `customer.subscription.deleted`. The multi-subscription case — a
customer refunded on one of two — becomes an operator signal to sort out by hand rather than
arithmetic over a field the event does not contain. That asymmetry is deliberate and correct: refunds
and chargebacks are adversarial events where the safe direction is revoke.

`mcp:pay:revoked:<customerId>` is **deleted whenever a new customer mapping is written**, mirroring
the `subdead` consume rule — otherwise it would suppress genuine mapping-miss alerts for a client
provisioned days after a refund, for the rest of its 30-day window. It exists to keep the alerting
honest. Revocation deletes the customer
mapping, so Stripe's trailing `customer.subscription.deleted` would otherwise hit the mapping-miss
path and raise the _same_ operator signal as the genuinely dangerous unresolvable case — and a signal
that fires on every routine refund is one that gets ignored when it matters. A miss with the revoked
tombstone present is an **expected** miss: log it, do not alert.

**Why the subscription set exists.** Demotion and revocation are keyed off events that identify a
_customer_, not a client-and-subscription pair. Without counting active subscriptions, cancelling the
duplicate subscription the branch above permitted would demote a customer who is still paying on the
other.

**Subscription events need the same resolution and miss handling the charge mapping has.**
`customer.subscription.deleted` resolves its `clientId` through `mcp:pay:customer:<customerId>`.
Because **Stripe does not order events**, two distinct misses are reachable, and the tombstone must
be keyed on the _second_ one — keying it only on the mapping miss (as an earlier revision did) guards
the rarer case and leaves the commoner one silent:

- **Mapping miss** (`subscription.deleted` before its first `checkout.session.completed`): no
  `clientId` at all.
- **Set miss, mapping present** (the duplicate-purchase ordering: `subscription.deleted` for sub2
  arrives before checkout 2's `SADD`): the mapping resolves, but `SREM` removes nothing.

So: **write `mcp:pay:subdead:<subscriptionId>` (30d) and raise an operator signal whenever `SREM`
returns 0, or whenever the mapping misses** (unless `mcp:pay:revoked:<customerId>` explains the miss).

The tombstone is then consumed at **step 2b, before the branch decision** — not at the `SADD` in
step 5. That ordering is load-bearing. An earlier revision checked it at the `SADD`, which meant a single
request would run the branch table (provisioning a client, or restoring a demoted one to `paid`), then
reach step 5, find the tombstone, skip, see an empty set and **demote the very client it had just
provisioned** — while the outcome written at step 6 still said `provisioned`, so the completion page
would tell the buyer their Deal Team access was live against a record sitting at `free-pilot`.
Deciding first, and giving an already-dead subscription its own `cancelled` outcome and page state,
removes the contradiction instead of papering over it with copy. `mcp:pay:subs:` has no TTL, so
nothing else would age a dead id out.

Do not rely on the accidental self-healing in the remaining ordering (SREM empties the set → demote →
the late checkout SADDs → the demoted branch PATCHes back to `paid`). It happens to work because the
branch table lines up, and that is luck rather than design.

**A dispute carries no customer.** The event object for `charge.dispute.created` is a **Dispute**,
identified by charge id and payment intent. Resolving it would need a Charge/PaymentIntent retrieve,
i.e. a Stripe API key this design deliberately does not have — hence the `charge.succeeded` mapping,
which keeps revocation at **zero API calls**. Route `charge.refunded` through the same mapping rather
than trusting its `customer` field, which is populated only when the charge is attached to a customer.
540 days is a deliberate outer bound (Visa permits up to 540 in specific dispute conditions; the
common window is 120), not a comfortable margin.

**Define the miss path.** `mcp:pay:charge:<chargeId>` can be absent — from TTL expiry, but far more
plausibly because **Stripe does not guarantee event ordering**, so a dispute may arrive before or
without its `charge.succeeded`. A silent no-op is the wrong default for a chargeback: `safeLog` a
distinct event **and** raise an operator-visible signal so an unrevoked disputed client surfaces as
an alert rather than as nothing.

Published grace policy: _Stripe retries a failed payment over its dunning window; if it ultimately
fails or you cancel, access drops to the free pilot ceilings rather than being cut off. A refund or
chargeback revokes access._ Must appear on the purchase surface **before** the buyer pays, and in
`/terms/`.

### The return page — one-time secret handoff

`createM2mClient` returns the secret once and nothing can re-retrieve it. Preserve that.

The Payment Link's completion redirect sends the buyer to
`GET /payments/complete?session_id={CHECKOUT_SESSION_ID}` on the Worker.

**Burn before render.** The handoff key's value is replaced with the `claimed` tombstone (30d)
**before the response is emitted**, not after. If the tombstone write fails, return 500 and render
nothing — otherwise a successful render with a failed write would leave live credentials in place and
a reload would show the secret twice. The tombstone replaces `delete` because the 900s handoff TTL
and the 90-day marker TTL are asymmetric: without it, a buyer who pays, shuts the laptop and returns
twenty minutes later is told "already claimed" when nothing was claimed.

**The redirect and the webhook are unordered channels.** Synchronous fulfilment shortens the window
between them but does not sequence them — the completion redirect is a browser navigation fired when
the buyer finishes paying, not something that waits on webhook delivery. So the buyer can arrive
first, and key-absence alone distinguishes nothing.

**Read the handoff key first**; a present handoff is authoritative even if the marker is missing, so
a valid credential is never left to expire unclaimed.

| `session_id`        | Handoff     | Marker                   | State                                                 |
| ------------------- | ----------- | ------------------------ | ----------------------------------------------------- |
| missing / malformed | —           | —                        | **400**, its own copy — not a retry loop              |
| valid               | credentials | `provisioned` or absent  | **Render the secret once**, tombstone first           |
| valid               | `claimed`   | `provisioned`, or absent | **Already claimed** → recovery                        |
| valid               | absent      | `outcome: restored`      | **Access restored**, client id shown                  |
| valid               | absent      | `outcome: duplicate`     | **Already active** → refund/recovery contact          |
| valid               | absent      | `outcome: cancelled`     | **Subscription already cancelled** → operator contact |
| valid               | absent      | `outcome: provisioned`   | **Expired unclaimed** (>900s) → recovery              |
| valid               | absent      | absent                   | **Still provisioning** → _Check again_                |

Only the provision branch ever writes a handoff, so rows 2 and 3 can only co-occur with
`outcome: provisioned` — `claimed` can never pair with `restored` or `duplicate`. The "or absent"
covers the case where the session key has aged out entirely, and resolves to the same copy — so no
combination falls through. With the session key at 90d and the tombstone at 30d from a render that can
only happen within 900s of fulfilment, the tombstone can never outlive the session key.

An unknown `session_id` and a genuinely-not-yet-provisioned one both render "still provisioning" —
deliberate: it costs nothing and avoids telling a stranger whether a session id is real.

**"Still provisioning" needs a bound.** It cannot distinguish a fresh arrival from a post-90-day visit
whose marker and tombstone have both expired, so its copy carries both the _Check again_ link **and**
a line routing anyone who paid more than a few minutes ago to recovery. Otherwise the expired case is
an unbounded loop.

**Recovery route** (what "already claimed", "expired unclaimed" and "duplicate" all point at): the
page shows the **client id** — not a secret — and directs the buyer to `contact@globalstrategic.tech`.
**It must not require the client id**, because the buyer most in need of recovery is exactly the one
who closed the page it was on; the Stripe receipt, or simply the email address they paid with,
resolves to the customer and thence to the client through `mcp:pay:customer:`. The operator then
rotates the secret with the operator-invoked capability and hands it over out of band, or refunds a
duplicate. Document this in `PILOT_ONBOARDING.md` § 0 as the one residual manual path, and as the
reason the webhook itself never rotates.

**Named deviation from `BACKLOG.md:169`.** That AC asks for a follow-up email carrying setup links and
the client id. GST sends **no email in v1** — Stripe/Link sends the receipt and invoice, and adding a
sender would pull in the BL-004 email-vendor decision this design otherwise avoids. Record it in
ADR-0027 as a deliberate deviation rather than an omission, with the trigger for revisiting it: if
recovery contacts become routine, the follow-up email is the fix, not more page copy. The
receipt-based recovery above is what makes the deviation tolerable.

_Check again_ is a plain `<a href>` back to the same URL. **No timed refresh**:
`<meta http-equiv="refresh">` is WCAG technique **F41**, a failure of SC 2.2.1 (Level A) against a
Slice 4 AC requiring 2.1 AA — and `htmlShell(title, body)` has no head slot to place it in anyway. A
user-initiated link sets no time limit and is 2.2.1-clean.

**Page-level security headers are the caller's job** (`src/lib/html-shell.ts:16-19`), and
`SECURITY_HEADERS.md` records that Worker HTML currently sets `Content-Type` and `Cache-Control` and
nothing else. Set explicitly, on **every response from the route**: `Cache-Control: no-store`
(also what makes _Check again_ re-hit the Worker rather than a bfcache entry),
`Referrer-Policy: no-referrer` (the URL carries `session_id` and the page links off-origin),
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and
`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'`.

**`img-src data:` is load-bearing, not boilerplate.** `htmlShell` embeds the GST delta favicon as a
`data:` URI (`src/lib/html-shell.ts:36`), and `default-src 'none'` would block it — the page would
render with the browser's default globe on the one screen where GST identity matters most. Because
the header test pins the set byte-exactly, getting this wrong would _freeze_ the defect rather than
surface it, so write the expected value from a rendered page rather than from this document.

The OAuth consent page already opts into `DENY`; follow it. Update `SECURITY_HEADERS.md`
§ MCP Worker subdomain, which lists that gap as an open operator decision — and while there, fix the
stale **bullet at `:130`** claiming Worker HTML sets no security headers, which `consent.ts:68-69`
already falsifies. (The `:118` paragraph is accurate for the status page; leave it.)

**Why the Worker, not the website** (BL-133 asks for this explicitly): a static Astro page would need
a cross-origin fetch, meaning `connect-src` entries in **both** `vercel.json` and `src/middleware.ts`
plus a CORS grant — and the secret would cross an origin boundary in a browser XHR. The Worker needs
none of that and reuses `htmlShell()` / `escapeHtml()`, which already carry `noindex,nofollow`, dark
mode, the GST delta favicon and the metric-matched mono stack. Record the deviation in ADR-0027.
Do **not** touch `INTERNAL_ENDPOINTS` in `src/middleware.ts` — `isAnonymousProbe` 404s any request
without a bearer, and a buyer's browser has none.

### Tests

`mcp-server/tests/integration/payments-webhook.test.ts`, copying the `unstable_dev` shape of
`oauth-m2m.test.ts`. The write order and the branch table are the load-bearing correctness argument
for retry safety, so they get assertions, not prose:

- Signature: valid → provisioned; bad → 401 nothing provisioned; absent header → 401; stale
  timestamp → 401. **Proven by mutation** — delete the check, watch it fail, restore. Plus the two
  cases the module description calls easy to get wrong and which nothing would otherwise catch: a
  header carrying **only a `v0`** signature is rejected (the downgrade case), and a header carrying
  **two `v1` values** where only the second matches is accepted (the secret-rotation case).
- **Session lease**: two concurrent deliveries for one `session_id` → exactly one provisions, the
  other gets 409; no second client. This is the concurrency case the gate exists for.
- Lease: replayed event id → no second provision; fulfilment failure → 500 **and the event is not
  deduped**; malformed payload → 400.
- Session gate: a **second distinct event id for the same `session_id`** → no second fulfilment.
- **Fault injection on ordering** (cases no CLI can reach): fail _after_ the handoff and _before_ the
  customer mapping, then retry **with the handoff key expired** → the promoted session lease still
  resolves it, the sequence completes, and **no second client is minted**. Fail _after_ the promotion
  and _before_ the handoff → retry completes and the buyer still gets a secret. Fail _after_
  `createM2mClient` and _before_ the promotion → a new clean client plus an operator signal, never a
  rotation. Fail _after_ the promotion and let the retry arrive **past the pre-promotion TTL** → still
  resolved, because the promoted TTL is 90d.
- Stale mapping: mapping present, record deleted → the mapping is removed, an operator signal fires,
  and a fresh client is provisioned rather than a 500.
- Branches: repeat event on an active client → no-op, **secret unchanged**, `outcome: duplicate`,
  operator signal raised. Demoted client → tier restored, secret unchanged, **`outcome: restored`
  asserted** (the page reads it, so the tier check alone is insufficient).
- `payment_status: 'unpaid'` → 200, nothing provisioned, **and the `creating` lease is released** (it
  provisioned nothing, so leaving it would 409 the eventual `async_payment_succeeded` for 300s).
  `async_payment_succeeded` → provisioned.
- Already-cancelled subscription: a `subdead` tombstone present at step 2b → `outcome: 'cancelled'`,
  nothing provisioned, no demotion of an unrelated client, operator signal raised.
- **Full** refund (`refunded: true`) → client revoked outright, customer mapping and subs set deleted;
  the **trailing `customer.subscription.deleted` raises no alert** because the revoked tombstone
  explains the miss. **Partial** refund (`amount_refunded < amount`, `refunded: false`) → operator
  signal, **client untouched and its secret still valid**. Full refund while `SCARD > 1` → the
  still-paying signal fires **before** the delete.
- Subscriptions: two active, one deleted → **not** demoted; both deleted → demoted.
  **Out of order, both misses**: `subscription.deleted` before its `checkout.session.completed`
  (mapping miss) and `subscription.deleted` for a second subscription before its `SADD` (set miss,
  `SREM` returns 0) → each writes a `subdead` tombstone and an operator signal, and the next checkout
  for that subscription is stopped at **step 2b** with `outcome: 'cancelled'` rather than provisioning
  a client that is then demoted in the same request.
- `charge.dispute.created` with no charge mapping → operator signal, never a silent no-op.
- Null Upstash client → 500, nothing provisioned. Body over 256 KB → rejected.
- **Completion-page headers**: the full set pinned across every state, following the
  `tests/unit/security-headers.test.ts` precedent — including `no-store` on _every_ response, which is
  what makes _Check again_ function at all, and `img-src data:` so the pin cannot freeze a
  favicon-blocking CSP.
- Radar exclusion: no SKU grants `tool:radar:*` / `resource:radar:read`, asserted over a non-zero
  probe count so the test cannot pass over an empty set.

### Docs

Rewrite `mcp-server/src/docs/operations/PILOT_ONBOARDING.md` § 0 so self-serve purchase is the primary
intake, operator provisioning is the negotiated/enterprise path, and the recovery route is documented,
including what replaces the NDA/DPA precondition. Then, in
[BL-093](BACKLOG.md#bl-093-mcp-server--commercialization-phase-4): close the 🟡 intake AC (the one
ending "Whichever ships first closes this") and update the request-access-form AC above it (the one
beginning "Request-access form/CTA"). **Also fix that stanza's Payments & invoicing block** — its
first AC reads "no payment code on the website or the Worker (none exists today; this stanza keeps it
that way)", which this initiative falsifies, and it carries a duplicate invoice-traceability AC.

_(Referenced by anchor and quoted phrase, not by line number: `BACKLOG.md` is ~292 KB and
append-heavy, nothing guards line pointers, and the three that were here drifted by 63 lines the day
after they were written.)_

Update **`mcp-server/src/docs/ARCHITECTURE.md`** § Request pipeline (`:80-88`) — a maintained numbered
dispatch list whose anchors code comments cite. A branch inserted between its steps 4 and 5, a
payments subsystem and a second Worker HTML page all belong in it, along with the endpoint paths its
Public-contract discipline rule requires naming.

---

## Slice 4 — Website purchase surface

**No new route.** Put the price and buy CTA on the existing `#tiers` block of
`src/pages/hub/mcp/index.astro:395-522`: it already renders the tier table, is already in the axe
sweep and the E2E suite, and its numbers are already pinned to `tiers.ts`.

**Slice 4 cannot start until [BL-145](BACKLOG.md#bl-145-design-partner-program--set-the-price-from-evidence-not-from-a-guess) has produced a price.** Everything below describes how to present one; none of it authorises inventing one. BL-145 is explicit that publishing a low number costs the positioning permanently and cannot be walked back, and that the tools-are-free copy on `/hub/index.astro` has to agree with whatever it decides.

- Deal Team card (`:426-439`) — add price and billing period; swap `accessHref('paid')` for the
  Stripe Payment Link. Pilot (`:420`) and Firm (`:450`) keep `mailto:`.
- Add the grace/refund line and a `/terms/` link adjacent to the buy CTA. `BACKLOG.md:170` requires
  that policy be published **before** the buyer pays, so **pin the line in
  `mcp-marketing-parity.test.ts` alongside the price** — an unpinned policy sentence is one copy edit
  from disappearing, and its absence is invisible.
- **Abandoned checkout, declined card and vendor outage** (a Slice 4 AC) are all handled **on Stripe's
  hosted checkout**, not by GST: an abandoned session simply never emits `checkout.session.completed`,
  a declined card is retried on Stripe's page, and a Stripe outage means the buyer never leaves it.
  Nothing reaches the Worker in any of the three, so the graceful handling is Stripe's — say that
  explicitly in ADR-0027 rather than leaving the AC looking unaddressed. The one state GST _does_ own
  is the buyer arriving before the webhook, which is the "still provisioning" row above.
- **Do not import the SKU catalog from `mcp-server`.** No file under `src/` imports mcp-server source;
  it would drag an `Env`-typed module graph into the Astro build and make a price parity test vacuous
  (page and constant agreeing by construction). The page **restates** the price as literal markup and
  `mcp-marketing-parity.test.ts` binds it to mcp-server source, as it already does for tier ceilings.
- **The parity test binds to a leaf module, not `catalog.ts`.** `tests/**` _is_ in the root tsconfig's
  `include`, and `exclude: ["mcp-server"]` does not stop an imported file entering the program — which
  is why `tests/integration/mcp-root-program-boundary.test.ts:12-17` exists and records that the
  website already reaches 26 mcp-server files through a single test import. So **`src/payments/skus.ts`**
  holds only `{ id, priceUsd, interval, tier, scopes }` with no `Env` and no `fulfill`, and
  `catalog.ts` imports it and attaches handlers. Not "a leaf like `tiers.ts`" — `tiers.ts:24` imports
  `safeLog` from `../auth/safe-logger`, and `skus.ts` inherits that edge if it types `tier` against
  `ASSIGNABLE_TIERS`, as it should. The edge is harmless (`safe-logger` imports nothing) and already
  exists, but the premise must be stated correctly. **Enforce it**: extend
  `mcp-root-program-boundary.test.ts` so a future `skus.ts` field referencing `Env` fails a test.

**Styling** (per STYLES_GUIDE.md): design-system tokens only — no hardcoded colors, spacing or font
sizes; verify light **and** dark **and** all 6 palettes via the PalettePanel; desktop-first with the
existing `max-width` overrides at 768px and 480px. The tier grid is four fixed tracks (`:1167-1171`)
with `table-layout: fixed` beneath it (`:1253-1256`), so adding a price and CTA to one card makes it
taller than its siblings — decide deliberately whether all three cards gain a price row. If they do,
"Free" on the Pilot card makes a **third** surface stating that commercial fact alongside the `/hub/`
FAQ and the announcement sash; reconcile the three once. The taller card cannot break
`hub-mcp-page.test.ts:48-67`, which asserts `x`/`width` alignment only, not height. `.mcp-tier__cta`
stays a text link per the explicit decision at `:1223-1230` — and its **vertical padding is
load-bearing**: that docblock records the padding is what holds the control above the 24px AA
`target-size` floor at `--text-xs`, and axe scans this route.

**Guardrails this page must not trip** (`mcp-marketing-parity.test.ts:383-425`): keep the literal
`non-contractual capability ceilings` and `NOT ratified SLA quotas`; **no em dashes**; the `%` guard
at `:411-413` is _digits-then-percent_, so "3.5%" fails but a bare `%` does not. Separately, the
vacuity count at `:106-107` requires exactly `EXPECTED_REMOTE_TOOL_COUNT + EXPECTED_PROMPT_COUNT`
matches of `<li><DeltaIcon …/>token</li>` — do not add a bullet of that shape. Per ADR-0010, nothing
in pricing copy may ratify an SLA by implication.

**Tests that WILL break and must be updated in the same commit:**

- `tests/e2e/hub-mcp-page.test.ts:115-127` asserts every `.mcp-tier__cta` starts with `mailto:` **and**
  contains `subject=`, `body=` and `(<tier id>)` — three assertions. Re-key: Pilot and Firm `mailto:`,
  Deal Team the Stripe link.
- `mcp-marketing-parity.test.ts:253-357` — the split on `<div class="mcp-tier">` and the
  `<code class="mcp-tier__id">` requirement are load-bearing; keep the markup shape, extend with the
  price pin.
- `tests/e2e/accessibility.test.ts` — `/hub/mcp/` is already row `:63`; no new row, but re-run.

**Accessibility of the Worker page.** `playwright.config.ts:15,42` pins `baseURL`/`webServer` to
`localhost:4321`, so the axe sweep cannot reach a Worker-served origin. Export the page renderer as a
pure function and run axe against `page.setContent(renderCompletePage(...))` in a dedicated spec, for
**all seven renderable states plus the 400** — not just the secret one. The uncovered ones matter most:
"Still provisioning" holds the _Check again_ link, the only interactive control in the entire buyer
flow.

**CSP** — record that **no new hosts are required**: a top-level `<a>` navigation to `buy.stripe.com`
is governed by no current directive (`form-action` covers form submission only; `navigate-to` was
dropped from CSP3 and ships nowhere; `default-src 'none'` does not fall back for top-level
navigation), and the return page is Worker-served. The existing inline `onclick="trackCTA(...)"` is
already covered by `script-src 'unsafe-inline'`. Record this in
**`src/docs/security/SECURITY_HEADERS.md`** (§ Adding a New External Service owns the CSP inventory),
not only in the ADR. If a later slice embeds Stripe Elements, `vercel.json` and `src/middleware.ts`
must change together — `tests/unit/security-headers.test.ts:96-102` compares them byte-for-byte, and
the second `vercel.json` frame-route rule needs the same directive.

**Privacy / terms / FAQ:**

- `src/pages/privacy.astro` § Information We Collect (`:28-41`) lists three bullets and never mentions
  payment. Add a payment-data bullet stating GST receives no card data (Stripe/Link is merchant of
  record and processor); name Stripe/Link in § Third-Party Services (`:74`).
- `src/pages/terms.astro` has no payment terms. Add Purchase Terms: subscription billing,
  cancellation, the refund/chargeback policy, and that a tier is a capability ceiling, not a
  service-level guarantee. This is client-facing commercial copy — `PILOT_ONBOARDING` § 3's "do not
  promise active audit capture in writing" applies, and **nothing guards `/terms/` or `/privacy/`**
  the way `mcp-marketing-parity` guards `/hub/mcp/`, so it needs deliberate review rather than a test.
- `src/pages/hub/index.astro:21-24` — the FAQ already carves out the MCP server ("granted per client,
  with a free pilot tier"); reconcile to name the paid tier. **It renders into FAQPage JSON-LD**, so
  check `src/docs/seo/JSON_LD_SCHEMA.md`.
- `src/data/announcements.ts:132` publishes a sash reading "Free pilot tier" deep-linked to
  `/hub/mcp/#tiers`, republished to claude.ai/design via `.design-sync`. Give it a deliberate look
  once `#tiers` becomes a pricing surface.
- **Directive 11 is blocking**: `grep -r "<old string>" tests/` for every copy string changed. Checked
  in advance — no test currently asserts the `/hub/index.astro` FAQ string or the privacy/terms copy,
  so that check is clean today, but re-run it after the rewrite.

**GA4** — ship without funnel analytics. `src/utils/analytics.ts:6` has no `ecommerce` category and
there is no consent gate: `PUBLIC_ENABLE_ANALYTICS` gates the inline config and `import.meta.env.PROD`
gates only the `gtag.js` loader. A purchase event would put commerce data through an ungated tag;
BL-001 owns that. Keep the `trackCTA('mcp-access-paid', 'hub-mcp')` click and nothing more.

---

## Slice 5 — Rail reuse (design only)

`skus.ts` is the leaf described above. `catalog.ts` attaches handlers:

```ts
interface FulfillmentResult {
  handoff?: { clientId: string; clientSecret: string };
}
interface Sku {
  /* …from skus.ts… */ fulfill(event: StripeEvent, env: Env): Promise<FulfillmentResult>;
}
```

`handoff` being optional is load-bearing: a handler with no credential to issue (a document, an
engagement deposit) satisfies the interface by returning `{}` — and the restored/duplicate branches
already exercise that path. `webhook.ts` looks up the SKU by `metadata.sku` and calls `fulfill`, so a
second product registers a handler rather than forking the route.

Second-product sketch for ADR-0027: **client pays an engagement invoice** — larger amounts, ACH/wire
over card, POs, per-client invoice identity — served by Stripe Invoicing on the same account and the
same webhook, **without** the `managed_payments` flag, so the MoR fee does not apply to large-ticket
B2B. Remediation payment links re-run the same handler, restoring tier through the customer mapping.

---

## Sequencing

1. `feat(mcp-server): PATCH /admin/oauth/m2m-clients/:id and payment provenance on the record`
2. `refactor(mcp-server): extract provisioning guardrails to a shared module`
3. `feat(payments): SKU leaf catalog and the MCP-access fulfillment handler`
4. `feat(payments): Stripe webhook rail with signature verification and Upstash leasing`
5. `feat(payments): the completion page and its one-time credential handoff`
6. `feat(payments): lifecycle demotion, revocation and subscription counting`
7. `docs: ADR-0027, ADR-0008 amendment, ARCHITECTURE, security headers, privacy/terms, onboarding, secrets`
8. `feat(hub): publish the Deal Team price and purchase CTA on /hub/mcp/`

Catalog precedes the webhook so no commit routes to a handler that does not exist; the completion
page's route and handler land together. Docs precede the page so the `/terms/` link the buy CTA
points at exists when it ships.

**Commit 8 is gated**: it publishes a live price and a live Payment Link, and `master` auto-deploys to
Vercel. It does not land until the operator has created the real Payment Link and set the exact figure.

**Operator tasks (cannot be done from here):** enable Managed Payments; set the price; create the
Payment Link with `metadata[sku]`, the required Firm custom field and the completion redirect; add the
Cloudflare WAF rule for Stripe's IP ranges; `wrangler secret put STRIPE_WEBHOOK_SECRET` for staging
(test mode) and production separately.

---

## Verification

**Local, before any push** (Directive 14 — the website four are not sufficient: `astro check` excludes
`mcp-server` and Vitest does not type-check):

```
npx astro check && npm run lint && npm run lint:css && npm run test:run
npm -w @gst/mcp-server run typecheck && npm run test:mcp && npm run test:docs
```

`test:docs` matters here: ADR-0027's links and the adr/README row are checked by
`docs-link-integrity.test.ts`, which resolves targets against **`git ls-files`** — so ADR-0027 must be
**staged** before the guard passes locally.

**E2E** — this task writes E2E, so running it is the verification step:
`npm run test:e2e -- --project=chromium tests/e2e/hub-mcp-page.test.ts tests/e2e/accessibility.test.ts`
plus the new completion-page axe spec across all eight states.

**Mutation proof** — delete the signature check, confirm the test fails, restore. Same for the
radar-exclusion assertion and the no-rotation caller guard. A guard not watched failing is not a guard.

**Live staging exercise (in-session, not deferred — Directive 6).** Staging auto-deploys on a green MCP
test run. Using Stripe test mode against `mcp-staging.globalstrategic.tech`:

1. `checkout.session.completed` → a client mints at tier `paid`, radar-free scopes, `selfserve-…` name.
   **Record the handler's p99** — that is the timeout budget evidence, since Stripe publishes no figure.
2. `/payments/complete?session_id=…` → secret renders once; second load says already-claimed; headers
   include `no-store` and `no-referrer`.
3. Unknown `session_id` → "still provisioning" with a working _Check again_, **not** already-claimed.
   Missing `session_id` → 400.
4. Replay the same event id → no second client. Send a **different** event id for the same session →
   still no second client (the session gate).
5. Repeat purchase on an active client → no-op, **secret unchanged**, "already active" page, operator
   signal raised. Then demote and repeat → tier restored, still no rotation.
6. Two active subscriptions, delete one → **not** demoted. Delete the second → demoted to `free-pilot`.
7. `charge.succeeded` then `charge.dispute.created` → revoked via the charge mapping, customer mapping
   deleted.

Step 6/7 is also what **verifies the Slice 1 vendor assumption** that subscription and charge events
reach the seller account under Managed Payments. If they do not, the lifecycle needs redesigning
around `invoice.*` or Link-specific events before commit 8 ships — so run this before publishing the
price.

**What the CLI cannot prove.** `stripe trigger` and `stripe listen` forward each event **once**, so
"500 → Stripe redelivers" is not exercisable that way; it is covered by the integration assertions plus
one manual **Resend** from the Dashboard against a deliberately failing handler. The partial-failure
orderings are likewise not CLI-reachable and live in the suite as fault injection.

**Never manually redeploy the Worker** — merge and let the pipeline run.
