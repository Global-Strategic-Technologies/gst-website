# BL-155 — Self-serve 3-day MCP trial, gated by Turnstile, no Stripe

> **Status**: designed and reviewed 2026-09-06, then **rescoped to the connector flow only** (operator, 2026-09-06) — see § Scope. **Slices 1 and 2b implemented** (2026-09-06, branch `feat/bl-155-self-serve-mcp-trial`); Slices 2, 3, 3a, 4 not started.
> **⚠ The rescope post-dates the eight review rounds below.** Everything written before it was designed for the M2M path. Slice 2b has since been reviewed and built; passages elsewhere may still assume an M2M-shaped trial — read § Scope first and treat pre-rescope text as suspect wherever the two flows differ.
> **Scope**: this document is the controlling design for BL-155. The acceptance criteria live in the
> BL-155 stanza in [BACKLOG.md](BACKLOG.md), which this design satisfies or explicitly deviates
> from; it does not restate them.
> **Provenance**: eight adversarial review rounds via the `plan-reviewer` gate (Directive 2), final
> verdict APPROVE with zero findings. Passages marked _an earlier draft …_ record designs that
> looked correct and were not — they are kept so the same mistakes are not re-derived. Two of them
> are load-bearing: the AE-cardinality inversion and the shared-limiter-bucket consequence.
> **First task for whoever picks this up**: confirm the open items in § Operator decisions are still
> current, then Slice 1 — it depends on nothing else.
> **Related**: [PAYMENTS_PLATFORM_BL-133.md](PAYMENTS_PLATFORM_BL-133.md) is the payments rail this
> deliberately does **not** use; its parked-trial blockquote in BACKLOG.md points here.

## Context

The operator's goal is **people can get a working GST MCP key without the operator in the loop**. BL-133 (payments) does not deliver that: it is self-serve access _after a card payment_, its SKU decision is `paid`-only, and its purchase surface is blocked on BL-145 producing a price that does not yet exist. So the shortest path to the actual goal is the trial — which was parked on 2026-09-06 on a Stripe staging-pass trigger, hours before this design unparked it.

**That parking bar was set too high, and this design unparks it deliberately.** The park reasoning was that designing on an unexercised Stripe lifecycle stacks inference — true, but it only binds the two _Stripe-based_ trial mechanisms. A GST-side trial touches Stripe not at all: no price, no Payment Link, no webhook, no API key. Nothing about it waits on that staging pass, and it is independent of BL-145.

**This is a new initiative, not BL-133 work.** BL-133 is the payments platform; a trial with no payment shares its tier/credential substrate but none of its rail. Filed as **BL-155**, branch `feat/bl-155-self-serve-mcp-trial` (already cut from master).

### What makes this different from everything shipped so far

This is the first endpoint that **mints a credential for a stranger with no operator and no payment in the loop**. Three consequences the plan must carry rather than discover:

1. **ADR-0008 must be amended, and this time it genuinely must.** When the trial was parked, leaving ADR-0008 alone was correct because nothing self-serve was being built. Building it breaks the ADR's **identity premise**, not merely a trailing clause: `:18` is _"Identity = delegation over the existing key roster"_, and a trial client has no roster human behind it at all. `:20` ("DCR disabled; pre-registration…") and BL-093's out-of-scope bullets also go false. The amendment ships in the same PR as the mint endpoint — see Slice 4 for its required scope.
2. **Everything in this Worker fails open, which is backwards for a credential minter.** `createLimiter` returns `null` when Upstash is unbound and callers proceed (`ratelimit/limiter.ts:125-126`); `single-flight-lock.ts`'s `acquire()` returns `true` on _both_ its failure modes (`:68`, `:75-77`). Reused as-is, an Upstash brownout mints unlimited free credentials. The one existing fail-closed precedent is `admin/inoreader-reauth.ts:135-142`, which 503s when Upstash is null — copy that.
3. **There is no IP limiter, no bot defense, and no email capability anywhere.** Confirmed by exhaustive search: no `TURNSTILE_*`, no MailChannels/Resend/SendGrid, no `[[send_email]]`. Turnstile and the IP limiter are net-new; email is avoided entirely by showing the credential once on the page.
   **Consequence, and how it is handled (operator decision 2026-09-06):** with no email, a credential shown once and then lost would be unrecoverable, and the one-trial-per-IP rule would then block re-signup for the window. Two measures, one preventive and one corrective — see § Lost-credential recovery. Email delivery is **ruled out**: it reintroduces the BL-004 dependency this design exists to avoid.

### Operator decisions taken (2026-09-06)

- **Trial expires at T+72h**, no auto-charge, conversion is a separate explicit purchase.
- **Turnstile is the identity gate**, not email verification — which removes the BL-004 vendor dependency completely.
- **Explicit rendering**, with an **Invisible** widget — created in Cloudflare by the operator; site key and secret key already exist. No Cloudflare logo appears at any point, at the cost of a mandatory Privacy Addendum reference (below).
- **Trial tier ceilings** at or below `free-pilot`'s 30/300/3/20 — approved as-is, on the basis that it is only three days.
- **`trial` stays undocumented** on the public tier surface. It exists in `ASSIGNABLE_TIERS` but is not published in marketing copy or the tier table, so `mcp-marketing-parity.test.ts` and `hub-mcp-page.test.ts` keep enumerating three tiers unchanged.
- **Reap grace: 30 days** after `expiresAt`.
- **One-trial-per-IP window: ≥72h**, so one identity cannot hold two live trials.
- **The signup page is localized** (Tier A) — see Slice 3.
- **Consent form stays one field**; the trial credential is issued as one `<clientId>:<secret>` string — see Slice 2b.
- **`client_credentials` stays ungated by tier** — a trial credential also works at `/token`; BL-156 is therefore docs and UX, and the ADR-0008 amendment describes both doors. Reasoning in BACKLOG.md § BL-155 Technical Context.
- **Lost-credential recovery is download + re-issue** — a client-side download at issue time, and secret rotation on the existing client for a repeat signup inside the window. Email delivery, show-again tokens, relaxing one-per-IP, and operator re-provisioning are all rejected — see § Lost-credential recovery.

### Turnstile mode — decided: Invisible

**The operator created the widget in Cloudflare and selected an Invisible widget.** The site key and secret key exist. An Invisible widget renders **nothing at all** — no widget, no Cloudflare logo, in any challenge outcome — which fully meets the UX goal.

(Background, since the plan previously recommended otherwise: removing Turnstile _branding_ from a visible widget is "Offlabel", an **Enterprise-only** feature, so a Managed widget could not have its logo turned off. The earlier recommendation was `appearance: 'interaction-only'`, which merely renders nothing _unless_ a challenge needs interaction. Invisible mode is strictly better for this goal and the operator's choice supersedes it.)

**Invisible mode carries a hard condition of service: GST's privacy policy must reference Cloudflare's Turnstile Privacy Addendum.** This is not optional and not deferrable.

- Link target: **`https://www.cloudflare.com/turnstile-privacy-policy/`** — the region-neutral URL, verified to resolve to the document titled _"Turnstile Privacy Addendum"_ (last updated 18 June 2025). Use this rather than the `/en-gb/` variant, since the site serves `en`, `es` and `pt-BR`.
- **No guard will catch this link if it breaks** — `docs-link-integrity` skips external `http(s)://` targets. It is a manual check.
- What the addendum says Turnstile collects, which the disclosure should reflect: client IP address, TLS fingerprint, User-Agent header, and sitekey with its associated origin.
- `/privacy/` is **Tier A** (`src/i18n/routes.ts:32`), so this is a catalog change in **`en`, `es` and `pt-BR`** plus `npm run i18n:stamp` — not a one-line edit.

**The disclosure has a second, independent reason to exist**, so write it to cover both: the one-per-identity control stores an HMAC of the visitor's IP with a TTL, and this repo's standing posture is that full IPs are _not_ retained (`audit/redaction.ts`'s `truncateIp` exists precisely for that).

**Provenance**: the Offlabel and Invisible-mode facts were read from Cloudflare's live documentation during planning, not recalled, and the Privacy Addendum URL and title were fetched directly. The plan reviewer had no web access and correctly declined to affirm them. Re-check Offlabel's plan gating at implementation time if it becomes relevant again — it is commercial terms, which change.

### Lost-credential recovery — decided: download + re-issue

The secret exists only in the mint response (`secretHash` is stored, never the secret), so "show it again from the record" is impossible by construction and must stay that way. Two measures:

**1. Download at issue time (prevention, Slice 3).** Alongside copy-to-clipboard, offer the credential as a downloadable file — a `.env` fragment or JSON, generated client-side from the mint response, never round-tripped to a server. Make the one-time nature unmissable in the copy. This is the measure that makes loss rare.

**2. Re-issue on the same client (recovery, Slice 2).** When an identity that already holds a live trial signs up again inside the trial window, **do not mint a second client**. Rotate `secretHash` on the existing record and return a new secret. Properties that make this the right shape:

- One identity still maps to one client, so the one-per-identity constraint is untouched and no farming path opens.
- No new storage, no second credential, no `expiresAt` extension — **re-issue must not slide the 72h expiry**, or repeated re-issues become an unbounded trial. State that explicitly in the handler.
- The previous secret dies immediately. Document that in the page copy: re-issuing invalidates the old credential, so a client still configured with it will start failing.
- The ≤1h JWT residual applies here too — a token minted under the old secret keeps working until it lapses. Same inherent property as expiry; disclose it, do not treat it as a bug.
- It reuses the mint path's Turnstile verification and IP rate limit unchanged; only the "reservation already held" branch changes behaviour, from refuse to rotate.

**Rejected, with reasons**, so they are not re-proposed: a _show-again token_ (single-use, short-TTL, per BL-133's post-checkout page) solves only "I closed the tab" and is strictly narrower than re-issue for more work; _relaxing one-per-IP when the credential was never used_ needs a new "has been used" flag and opens a sign-up-don't-use-repeat farming path; _operator manual re-provisioning_ defeats the no-operator-in-the-loop goal that is this initiative's entire point.

**Verification**: re-issue returns a working new secret; the old secret is refused at `POST /token`; `expiresAt` is unchanged across a re-issue; and a re-issue does **not** create a second client record. The expiry-unchanged assertion is the one that catches the unbounded-trial mistake.

### Scope: the connector flow only — rescoped 2026-09-06

**BL-155 delivers a self-serve trial for the _connector_ flow: the visitor signs up, receives a credential, pastes it at the consent page, and uses GST from Claude Desktop, Claude Code or Cursor exactly as an operator-onboarded pilot does. The M2M / `client_credentials` self-serve path is a separate initiative** — see § The M2M initiative below. The operator's call, taken to cut complexity after an earlier draft of this design covered only the M2M path.

**Why the M2M-only shape happened, recorded because the failure mode is reusable.** This design was built _upward from the credential_ and never backward from the user. BL-133 had already established the M2M substrate (tiers, `client_credentials`, the provisioning script), so "mint an M2M client with an expiry" was the obvious next brick — and it is a correct brick. Every question the design then asked was about the moment of issuance: how to mint safely, rate-limit, reap, fail closed. Nobody asked what the recipient does at minute two. It survived eight `plan-reviewer` rounds because those rounds check the design against the codebase — line numbers, limiter behaviour, fail-open claims — which is internal consistency, not reachability. The verification step said _"connect an MCP client, make a call"_, vague enough to read as covered while being the exact unexamined gap. It surfaced only when Claude Design drew the issued state, because a picture of a success state is the first artifact in the process that has to depict a **user** rather than a mechanism. **The lesson for the next initiative: a plan that mints something must name, concretely, the first three things the recipient does with it.**

**How the design brief then compounded it.** The first Claude Design hand-off opened by naming "Claude Desktop, Claude Code and Cursor" as the clients and asked the issued state for "how to actually plug these into an MCP client", while supplying no wire detail — i.e. it described connector users while the credential was M2M. The returned mockup fused the two: a correct M2M signup, then a `claude_desktop_config.json` block with `X-GST-Client-Id` / `X-GST-Client-Secret` headers, invented credential prefixes (`gst_trial_…`, `gsk_live_…`) and a placeholder host. **None of those exist.** The contradiction was in the brief, not the design work. Under the rescope the mockup's _instinct_ was right and its details were not.

### The two auth paths — the distinction this initiative kept confusing

Keep these separate in every document, page and prompt. Fusing them is what produced the defect above.

|                | **Connector flow** — BL-155                                                | **M2M flow** — separate initiative                                |
| -------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Who            | Roster humans and pilots; now also trial visitors                          | Developers, headless pipelines                                    |
| Credential     | `MCP_KEY_*` (operator-issued) — **plus, after BL-155, a trial credential** | `m2m_…` client id + secret                                        |
| How it is used | Paste the server URL into the client, approve the consent page             | `POST /token` with `grant_type=client_credentials`, then a bearer |
| Token shape    | Auth-code grant, **refresh tokens in KV**                                  | Self-contained 1h JWT, no refresh                                 |
| Documented at  | [`/hub/mcp/get-started/`](../../pages/hub/mcp/get-started/index.astro)     | Nowhere public yet — only `testing/uat/SETUP.md` in-repo          |

The connector path identifies the human by having them submit an existing **`MCP_KEY_*`** value ([`oauth/consent.ts:5-6`](../../../mcp-server/src/oauth/consent.ts): _"OAuth is a delegation layer over the existing key roster"_), matched by [`matchToken`](../../../mcp-server/src/auth/bearer.ts) against **Worker env vars**. That last detail matters twice: it is why a stranger cannot use the connector flow today, and it is why "just mint them an `MCP_KEY_*`" is not an option — a deploy-time secret cannot be issued self-serve. [PILOT_ONBOARDING.md:42](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md) already records the split for external pilots: an M2M holder "never has an `MCP_KEY_*`", and the connector guide "does not describe their flow".

### What the rescope requires — the new core of BL-155

Slices 1–3a survive; the credential record is the same record. What changes is where it is _presented_. Three pieces, all in the OAuth path (detailed in Slice 2b):

1. **A second identity source in `consent.ts`** — a KV lookup of the trial client, secret verification and an `expiresAt` check, as an _alternative_ to the env-var scan, not a replacement.
2. **Props must carry tier and expiry.** The connector path builds its own props at `completeAuthorization` ([`consent.ts`](../../../mcp-server/src/oauth/consent.ts)) and carries **no tier** today. Without it the tier-scoped radar deny and the `rateLimitSubject` split — both designed in Slice 2 for the M2M path — silently do not apply to connector trials, and a trial user gets radar. This is the easiest thing in the rescope to forget and the most expensive to forget.
3. **Expiry must bind the refresh path.** M2M tokens are self-contained and lapse in an hour, so expiry nearly enforced itself. Connector grants carry **refresh tokens**, so a grant minted at T+71h could refresh indefinitely and **the trial would never end**.

**The refresh problem is solved, and the mechanism was verified against the installed library (0.10.3), not assumed — and it is not the one first written here.** The first draft said "check `expiresAt` on refresh, revoke past it". Two facts killed that: `tokenExchangeCallback` receives no env and no `OAuthHelpers`, so `revokeGrant` is unreachable without an env-capture pattern `ARCHITECTURE.md` forbids for our Worker code; and the library already refuses an expired grant _before_ the callback runs, so a "throw past expiry" belt is dead code. What shipped (Slice 2b, 2026-09-06): the callback returns `refreshTokenTTL` **and** `accessTokenTTL` clamped to `expiresAt` on the auth-code exchange (the library does not clamp the auth-code access TTL itself — a consent at T+71h30m would otherwise hold a 1h token past the trial), and `api-handler.ts` refuses a validated token whose props are past `expiresAt` on every request. Zero KV. The corollary, stated in AUTH.md: an early PATCH/DELETE does not cut an already-consented grant short; it runs to the `expiresAt` captured at consent.

### The M2M initiative — split out, not dropped

Self-serve `client_credentials` becomes its own backlog stanza. **It reuses BL-155's signup workflow and design wherever possible** — operator instruction — so that a visitor meets one signup experience regardless of which credential they end up holding. Concretely, it inherits: the mint endpoint's Turnstile gate, IP limiter, lease/atomicity and fail-closed posture; the signup page's states, copy patterns and one-time-secret handling; and the § Lost-credential recovery decisions. What is genuinely its own: the `/token` exchange, the published developer-onboarding page (the former Slice 3b), and the hourly re-exchange story.

**Already landed early, and left where it is:** Slice 1's expiry check on the `client_credentials` grant in `m2m-token.ts` is strictly the M2M initiative's enforcement point. It shipped in BL-155 Slice 1 (2026-09-06) before the rescope. It is correct where it sits and costs nothing; do not unwind it, and do not re-implement it in the new initiative.

**Not chosen: minting a short-lived `MCP_KEY_*`.** It would fit the connector flow with no consent-page change at all — but `matchToken` scans Worker env vars, so issuing one means a deploy per signup. Mechanically impossible for self-serve, independent of whether it would be wise.

## Slices

Sliced so each ships independently and the first is useful even if the rest never lands. Slice 3a is the one exception to independence — it produces the design Slice 3 builds, so it runs first, and it can run in parallel with Slices 1 and 2 since it needs no code.

### Slice 1 — Credential substrate (no public surface)

Server-side only; nothing external can reach it. Valuable on its own — `PATCH` fixes a standing defect where any tier change means delete-and-recreate, i.e. a new credential for the client.

- **`trial` tier** in `mcp-server/src/ratelimit/tiers.ts` — add to `TIER_LIMITS` (`:48-53`) and `ASSIGNABLE_TIERS` (`:65`), at ceilings **at or below** `free-pilot`'s 30/300/3/20. **Must be added to the frozen mirror `scripts/provision-client.mjs` in the same array position**, or the parity test `tests/unit/scripts/provision-client.test.ts:42-44` fails on order-sensitive array equality. Nothing in `admin/oauth-clients.ts` or `limiter.ts` needs editing — the validation message is generated from `ASSIGNABLE_TIERS.join`.
- **`expiresAt?: string`** on `M2mClientRecord` (`src/oauth/m2m-clients.ts:44-52`), **plus a KV `expirationTtl` for reaping — both, not one.** An earlier draft argued field-only on the grounds that an expired-but-present record stays listable and PATCHable for conversion. That is right about the _conversion window_ and wrong about _forever_: an unauthenticated minter with no GC grows `OAUTH_KV` without bound, and `listM2mClients` is `kv.list` + one sequential `get` per client (the exact forcing question BL-154 Slice 1 exists to answer). So: the **field** is what the mint check reads, and a **`expirationTtl` set to `expiresAt` + a grace window** (30 days, long enough that conversion and support questions still find the record) is what removes it. Pick the grace explicitly and say why. Note the only other `expirationTtl` in the OAuth code is the jti replay key (`m2m-token.ts:339`), so this is a second instance of an existing mechanism rather than a new pattern.
  **The TTL is not free at the call site.** `createM2mClient` (`m2m-clients.ts:68-85`) does a bare `kv.put` with **no options**, so the TTL has to be threaded through its signature. More importantly, **`updateM2mClient` must decide explicitly what a PATCH does to it** — a plain re-put **drops the TTL entirely** and silently un-reaps the record, while blindly re-setting it slides the reap window on every admin edit. Conversion _is_ a PATCH, so this is the main path, not an edge case.

  **Resolved at implementation (2026-09-06): derive an absolute reap instant, do not preserve a relative one.** The two rules first written here — conversion clears the TTL, any other PATCH preserves the remaining one — collapse into a single rule if the reap point is computed as `expiresAt + grace` on every write. It is idempotent, so it cannot slide; a record with no `expiresAt` has no reap; and clearing `expiresAt` on conversion clears the reap for free.
  Why not literally "preserve the remaining TTL": KV's **point reads (`get`, `getWithMetadata`) do not expose expiration at all** — only `list()` does, as an absolute timestamp, and only when the key has one. So preserving would mean a list scan to recover a value already computable from a field on the record. (An earlier draft of this paragraph claimed KV offers _no_ way to read a key's TTL. That is wrong — `list()` does. The point stands on cost, not impossibility.)

- **Enforced at token mint**, in `handleClientCredentialsToken` — placed **after the auth branches complete (`m2m-token.ts:~352`), not right after the record fetch at `:313`**. Checking pre-auth would leak client existence and expiry to an unauthenticated caller. Reject with `tokenError('invalid_client', …, 401)` (`:265-270`) plus a `safeLog({ event: 'oauth.m2m.rejected', reason: 'client-expired' })` mirroring `:323-330`.
- **`PATCH /admin/oauth/m2m-clients/:id`** (tier + scopes) plus `updateM2mClient()`. Validate tier through `isAssignableTier` exactly as POST does (`admin/oauth-clients.ts:200-208`); change the item-route 405 header from `Allow: 'DELETE'` to `'DELETE, PATCH'` (`:254`); `safeLog` mirroring the create/delete siblings. **No `worker.ts` routing change** — `oauth/default-handler.ts:31-33` prefix-matches and is method-agnostic.
- Note the existing asymmetry: **scopes are not validated server-side** on POST (`:190` checks only `Array.isArray` + non-empty); that gate lives only in the CLI. PATCH should validate scopes properly rather than inherit the gap.

### Slice 2 — Public mint endpoint on the Worker

- **Route slot: between `worker.ts:473` and `:485`** — after the `/admin/inoreader/reauth/*` pair, before the `isRoutedPath` gate. This skips `authenticate()` (a stranger has no key) without being 404'd. Add an `isTrialSurfacePath` predicate in the shape of `isOAuthSurfacePath` (`:127-133`). **A path added after `:485` without joining `isRoutedPath` returns a silent 404 with no log line** (`:486-489` deliberately omits `safeLog`). `tests/unit/dispatch/host-route.test.ts` asserts source order — keep the branch after `resolveHostRoute`.
- **`POST /trial/signup`**, body carries the Turnstile token. Verify server-side against `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET_KEY` before minting anything.
- **Wrap the response in `withCors`.** Every browser-reachable branch does (`worker.ts` 394/415/447/451/489); the reauth branches this sits beside do **not**, because they are same-origin — so copying their shape wholesale silently breaks the browser call. Preflight is already handled earlier (`:372-374`, before routing).
- **Fail closed, everywhere.** A null Upstash client is a **503, never a proceed** — the `inoreader-reauth.ts:135-142` precedent, not `single-flight-lock.ts`'s `acquire()`, whose fail-open behaviour is exactly inverted for this use. Note the `alert-evaluator.ts` `SET NX` idiom cited below is _itself_ fail-open (`if (!redis) return true`) — borrow its Redis shape, not its failure semantics. Same for an unbound `OAUTH_KV` and for a Turnstile verify that throws rather than returning a verdict.
- **Turnstile verification must be hardened, not just called.** Assert the returned `hostname` matches the expected site and the `action` matches what the widget was rendered with; handle `timeout-or-duplicate` explicitly (tokens are single-use and short-lived) as a clean retry rather than a 500. A siteverify call that only checks `success` accepts a token minted for a different site or replayed.
- **Rate limit by IP**, a new `Ratelimit` instance with its own prefix (e.g. `mcp:ratelimit:trial:ip`) over `createMcpClient(env, { retry: false })`. Key on the **full** `CF-Connecting-IP` under an **HMAC with a server secret** — a bare hash of an IPv4 address is brute-forceable over the whole space, so it is not a de-identification measure. Do **not** reuse `audit/redaction.ts`'s `truncateIp`: it collapses a /24 into one bucket and would let one NAT'd office exhaust every visitor behind it.
- **One trial per identity** via `SET NX EX`, Redis shape per `observability/alert-evaluator.ts:128-131`. **State the `EX` explicitly and justify it** — too short and the constraint is theatre, unbounded and it becomes indefinite per-visitor retention. Keyed on the HMAC'd IP for v1, behind a named key-derivation function so it can be strengthened without touching the handler. **Be honest in the stanza that this is a speed bump, not an identity control**: IPs are shared and trivially rotated. It raises the cost of casual farming; the real containment is the trial tier's ceilings and the 72h expiry.
- **Mint atomicity — a two-phase lease, and inherit BL-133's _reasoning_, not just its shape.** `PAYMENTS_PLATFORM_BL-133.md:158-170` uses a deliberately **short** lease and branches on the lease's **value**, because the `DEL` can itself fail and because presence alone is unsafe under concurrent redelivery. Copy that idiom exactly: `SET NX` a **short** lease (~300s) → mint only if won → on success **overwrite the key with `minted` at the long TTL** → on failure `DEL` and return 5xx.
  Here the failure mode is _inverted_ relative to BL-133, which is why the short lease matters more, not less: a lost `DEL` there costs one delayed retry; here it would lock a visitor out for the whole window. The short lease bounds that lockout to minutes.
  **The long TTL must be reasoned against the 72h trial life**: anything below 72h lets one identity hold two live trials simultaneously. State the chosen value and that constraint together.
- **Minted client**: `trial` tier, `expiresAt` = now + 72h, minimum scopes. **`expiresAt` must be non-optional on this path** — the field is optional on the record and the mint check reads it, so an omission yields a _permanent_ credential, and `createM2mClient:68-85` already defaults an omitted `tier` to `free-pilot`, i.e. a dropped field degrades **looser, silently**. Construct both explicitly and assert them at the **record** level in tests, not only via the decoded token.

- **⚠️ Radar must be denied by a tier-scoped pipeline check — scopes do NOT contain radar today.** An earlier draft claimed minimum scopes "with radar excluded" was stricter than `provision-client.mjs`'s `--allow-radar`. **That claim is false**, and the reason is a pre-existing hole this plan must not build on:
  - The **only** `assertScope` call in the entire server is `resources/radar.ts:118` (`resource:radar:read`), which gates the radar **Resource**. `handle-authenticated.ts:123` gates only the `/radar/snapshot` HTTP endpoint.
  - **The live radar MCP tools are not gated at all** — `registerRadarLiveTools(server, env, metrics)` is unconditional at `server.ts:425`, and `tools/radar-live.ts` contains no scope assertion.
  - `hasScope` matches by prefix (`auth/scopes.ts:84-94`), so **`tool:*` already covers `tool:radar:search_radar`**. `provision-client.mjs`'s `MINIMUM_SCOPES = ['tool:*', 'resource:regulations:read']`, commented "deliberately radar-free", is only _resource_-radar-free.

  **Why this matters is commercial gating, not cost — an earlier draft of this stanza got that wrong.** It claimed a trial credential would "spend the shared Inoreader Zone-1 budget, bounded only by the trial tier's radar ceilings, which scale with signups." The repo says the opposite, in a file this plan already cites: `ratelimit/tiers.ts:16-21` records that radar tool calls are **~99% Upstash cache hits (zero Inoreader spend)**, that only a cold/expired-cache miss falls through to a live fetch, and that the per-client radar caps are _"per-client FAIRNESS + thin cache-cold defense-in-depth, **NOT** the Inoreader-budget control"_ — the global circuit breaker (`ratelimit/circuit-breaker.ts`, ADR-0006) is. Production cron is `["0 */6 * * *", "*/15 * * * *"]`, and the 6-hourly job refreshes the snapshot on exactly the cadence of the 6h Upstash cache. (It is **not** purely cache-only, though: `tools/radar-live.ts:107` describes `search_radar` as "calls Inoreader directly with a 6h Upstash cache", so a cold window does reach upstream — which is what the breaker catches.)

  So the real reason to deny radar to trials: **radar is the Inoreader-funded proprietary product the operator gates commercially.** BL-133's own AC says a self-serve path "must not become the bypass". Handing strangers free radar access is a pricing decision made by accident, not a cost incident. **This still blocks the mint endpoint** — the mechanism below is unchanged — but the urgency is commercial, and the existing pilot clients holding `tool:*` are a far smaller matter than the withdrawn budget framing implied.

  **The mechanism: a tier-scoped deny at the pipeline seam.** `toolClass` is already computed at `handle-authenticated.ts:74-76` and `auth.tier` is already in scope at `:83`, so a `tier === 'trial' && toolClass === 'radar'` deny sits naturally beside the limiter call. No behaviour change for any existing identity, and it survives a future scope-catalog refactor.
  **Frame the refusal as JSON-RPC, not HTTP.** The 403 block at `:121-145` is a tempting shape but is plain-HTTP framed because `/radar/snapshot` is a plain HTTP endpoint. Denying an MCP `tools/call` must use `MissingScopeError` (code `-32002`, `auth/scopes.ts:107-109`), or a trial client gets a transport-level error instead of a legible refusal.

  **Two mechanisms considered and rejected, recorded so they are not re-proposed**: (1) _adding `assertScope(scopes, 'tool:radar:*')` to the live radar tools_ is **inert here** — by the very prefix-matching cited above, `hasScope(['tool:*'], 'tool:radar:search_radar')` is `true`, so the trial grant satisfies it and contains nothing. It only bites once a per-tool scope catalog exists (`SCOPES` today exposes only `TOOL_ALL`/`PROMPT_ALL`), which is separate work. (2) _A zero radar ceiling on the trial tier_ depends on a zero sliding-window being representable in `@upstash/ratelimit`, which is unverified. Whatever lands, **prove it by mutation.**

  **This is pre-existing, not introduced here — and it is a mis-stated control rather than an incident.** `--allow-radar` and `MINIMUM_SCOPES`' "deliberately radar-free" comment both describe a guarantee the code does not provide, and BL-133's AC that radar scopes "stay excluded from any self-serve purchase" rests on the same false premise. **File it and correct those two claims**; do not quietly fix it inside this initiative without saying so. But calibrate: every client holding `tool:*` today is operator-provisioned and trusted, radar is cache-served, and the breaker guards the upstream — so this is a gap to close deliberately, not to hotfix.
  Note the general fix is **not** a Directive-6 breaking change needing migration — every existing client holds `tool:*` or full `DEFAULT_SCOPES` and would pass a wildcard assertion by prefix — it is simply near-useless until a per-tool scope catalog exists. That, not migration risk, is why it is filed separately rather than absorbed here.

- **Separate the two identities: constant `keyOwner` for attribution, per-client subject for the limiter.** This went wrong twice and the final shape matters.

  First draft: name clients `trial:<short-id>` "keeping AE cardinality bounded" — **backwards**. `oauth/key-owner.ts:9-20` documents cardinality as deliberately roster-sized, so a per-visitor keyOwner is an unbounded AE index and can fire the traffic-spike ticket alert per visitor.

  Second draft: one constant keyOwner, accepting a shared rate-limit bucket as "one heavy user throttles the others" — **materially worse than that, and wrong**. `ratelimit/limiter.ts:157-169` passes `keyOwner` **directly** as the Upstash `Ratelimit` identifier for all four buckets, so one constant owner is **one global bucket** at trial ceilings. At ≤300 calls/day shared across every trial worldwide, the second concurrent evaluator gets 429s, and one signup can burn the global daily budget and kill every other trial with no operator signal. A trial that rate-limits the person evaluating it is not a funnel.

  **The two properties are separable and `key-owner.ts` only constrains one of them** — it bounds the AE index and alerting attribution, not the limiter identifier. So: keep a **constant `keyOwner`** for Analytics Engine, `safeLog` and alerting, and thread a **distinct per-client limiter subject** (the `clientId`) through to `check()`.

  **How the constant owner is actually derived, since it is not free**: `keyOwnerFor(record)` returns `m2mKeyOwner(record.name)` (`oauth/m2m-clients.ts:130`), so a constant `M2M:trial` requires every trial record to be **named** `trial` — and `name` is the operator-facing label in admin listings, `safeLog` and the onboarding email. Decide and write down which: **(a)** name every trial record `trial` and let `clientId` + `createdAt` distinguish them in admin listings (simplest, no shared-code change, mildly worse listings), or **(b)** special-case `keyOwnerFor` for trial records (better labels, touches shared code the rest of this plan avoids). Recommend (a). Do not leave this implicit — the whole keyOwner/limiter split rests on it. Concretely: an optional `rateLimitSubject` on `AuthSuccess` that defaults to `keyOwner`, passed at the single `.check()` call site (`pipeline/handle-authenticated.ts:88`). **Set it only on the M2M trial path**, so every other identity keeps its current `keyOwner`-keyed bucket byte-for-byte. Nothing pins the `check()` signature — one call site in `src`, zero in `tests` — and `AuthSuccess` already has the precedent in its optional `tier` field, documented as "omitting it is the no-regression behavior, not a gap" (`auth/bearer.ts:42-51`); give `rateLimitSubject` JSDoc in that same voice.

  The limiter's Redis namespace does then grow per trial client — but those are sliding-window entries with 60s/1d natural expiry that self-reap, which is categorically different from a permanent AE index dimension. Say that in the code comment so the next reader does not "fix" it back.

  **Close the observability hole the split creates, in the same change.** The 429 path logs `auth.keyOwner`, so with a constant owner every trial throttle attributes to `M2M:trial` and nobody can tell _which_ trial client is being limited — the exact signal needed to spot farming. Add `rateLimitSubject` to the `ratelimit.exceeded` `safeLog` line. This costs **zero** cardinality: `key-owner.ts:9-20`'s constraint governs the AE index dimension, not log fields.

- **Secret returned exactly once** in the mint response and never retrievable from the record — preserving the property `provision-client.mjs` deliberately protects (its onboarding email excludes the secret by design). Recovery is a **re-issue**, never a re-read: see § Lost-credential recovery.
- **The `minted` lease branch rotates rather than refuses.** Per that section, when the lease value is already `minted` and the client's `expiresAt` is still in the future, the handler regenerates the secret on the **existing** record (`secretHash` only) and returns it. It must **not** create a second client, must **not** touch `expiresAt`, and must leave the lease key's TTL alone — otherwise repeated re-issues extend the trial indefinitely. A `minted` lease whose client has already expired is a refusal, not a rotation.
- **The ≤1h token residual is inherent and must be disclosed.** `mcp_m2m_*` tokens are self-contained JWTs verified without a KV read (ADR-0008 § Consequences), so a token minted just before `expiresAt` keeps working until it expires. Say so in the ADR amendment and in the user-facing copy, and build the staging exercise expecting it rather than treating it as a bug.
- **CORS**: `https://globalstrategic.tech` and `www.` are already allowed (`auth/cors.ts:44-50`). **Vercel preview origins and localhost are not**, so a browser-side form will fail CORS on every preview branch — decide explicitly whether to add them or to test previews against staging.

### Slice 2b — Consent-page identity, tier propagation, and refresh binding

**✅ Implemented 2026-09-06** (plan-reviewed: one REVISE round, then APPROVE). Built ahead of Slice 2 because every piece is verifiable with an admin-provisioned trial record, so it ships and proves itself without the mint endpoint; it also absorbed the tier-scoped radar deny and the `rateLimitSubject` split that Slice 2 below still describes as its own. Modules: `oauth/consent-identity.ts`, `oauth/token-exchange.ts`, `pipeline/tier-gate.ts`; tests `tests/unit/oauth/{consent-identity,token-exchange,api-handler}.test.ts`, `tests/unit/pipeline/tier-gate.test.ts`, `tests/integration/oauth-trial-consent.test.ts`. Operator-facing account: `operations/AUTH.md § An M2M record at the consent page`. Bullets below are the design as reviewed; where the built mechanism differs (refresh binding — see § What the rescope requires), the built one is authoritative.

Slice 2 mints the credential; this slice is what makes it usable from a connector client.

- **A second identity branch in [`consent.ts`](../../../mcp-server/src/oauth/consent.ts)`.handleAuthorizePost`.** Today identity is `matchToken(submittedKey, env)`, a constant-time scan of `MCP_KEY_*` **Worker env vars**. Add a branch that resolves a submitted trial credential against the KV record instead: `getM2mClient` → `verifyM2mSecret` → `expiresAt` check. **Order matters**: try the env roster first so no existing operator flow changes shape, then the trial lookup. Keep the failure response identical for both — a distinguishable error tells an attacker which namespace a submitted value lives in.
- **Reuse, do not re-derive.** `verifyM2mSecret` and the `expiresAt` semantics already exist from Slice 1, and the token-mint path's expiry check (`m2m-token.ts`) is the reference for placement: **after** the credential is verified, never before, so the form cannot be used to probe which client ids exist.
- **Form shape — decided (operator, 2026-09-06): one field, unchanged.** The signup page issues the trial credential as a single opaque string, `<clientId>:<secret>`; the consent handler tries the env roster first, then splits on the first `:` (client ids are base64url, so the split is unambiguous) and resolves against KV. The roster flow is byte-for-byte unchanged, the visitor has exactly one thing to copy, download and paste, and Slice 3's copy and the Claude Design brief can say "paste this at the consent page" with no second field. Two fields were rejected: a connector visitor never needs the two values separately.
- **Props must carry `tier` and the trial's `expiresAt`.** `completeAuthorization` currently writes `{ keyOwner, userId, scopes, authKind: 'oauth' }` — **no tier**. Slice 2's tier-scoped radar deny and the `keyOwner`/`rateLimitSubject` split were both designed against the M2M path and **silently do not apply** to a connector trial until the tier reaches the pipeline through these props. Left undone, a trial user gets radar through Claude Desktop — the exact commercial gate this initiative exists to hold. Note [`api-handler.ts:17-30`](../../../mcp-server/src/oauth/api-handler.ts) validates the props shape `consent.ts` writes and fails closed on a mismatch, so this is a two-file change with a guard already in place.
- **Bind expiry to the refresh path via `tokenExchangeCallback`.** Verified against the installed `@cloudflare/workers-oauth-provider`: the callback receives `grantType: GrantType.REFRESH_TOKEN`, the grant's `props`, and a `grantId` + `userId` pair its own docstring points at `revokeGrant`. Read `expiresAt` from props, revoke past it — **zero KV reads on the hot path**. `refreshTokenTTL` (per-grant, settable from the callback result) is a second, declarative belt; use both, since the TTL alone cannot react to a credential revoked early. **Not wired today** — [`provider.ts:50`](../../../mcp-server/src/oauth/provider.ts) sets only `accessTokenTTL` — so adding the callback is net-new surface that every _existing_ grant will also flow through. **Make the non-trial path an explicit early return and test it**, or this slice silently becomes a change to every pilot's refresh behaviour.
- **`keyOwner` for a connector trial.** The M2M design settled on a constant owner for AE cardinality plus a per-client `rateLimitSubject` for the limiter. The OAuth path derives `oauthKeyOwner(userId)` from the roster key name, so the same split has to be re-established here rather than inherited — a per-visitor `OAUTH:<clientId>` would reintroduce exactly the unbounded-cardinality mistake § What makes this different records.
- **Verification.** Mutation-prove each: a trial credential is refused at consent after `expiresAt`; a refresh past `expiresAt` is revoked rather than renewed; a connector trial is denied radar (the check that fails if props lose the tier); an existing `MCP_KEY_*` consent flow and an existing pilot's refresh are **byte-for-byte unchanged**. The last one is the regression guard for the whole slice.

### Slice 3a — UX design hand-off to Claude Design (precedes Slice 3)

The signup page is the only surface a stranger ever sees, and — because `trial` stays undocumented on the public tier table — it is also the only place they learn what they get. It is worth designing rather than assembling. This slice produces the design; Slice 3 builds it.

**Follow the BL-153 precedent exactly** ([LOCALIZATION_HANDOFF_BL-153.md](LOCALIZATION_HANDOFF_BL-153.md)): the returned hand-off is committed here as an initiative doc with its screenshots under `assets/`, reproduced verbatim with only file references adjusted; **the interactive prototype is NOT committed** — Claude Design remains its source of truth. At closure the hand-off is archived per the [initiative-doc lifecycle](README.md).

**The design system is already synced** to the Claude Design project (`https://claude.ai/design/p/660c7df6-e99f-4f47-b9f7-b1ab32e52969`) — tokens, `html.dark-theme`, all six `html.palette-N` blocks, the `.brutal-*` vocabulary, ten specimen galleries and 19 chrome cards sliced from real production output. See [CLAUDE_DESIGN_SYNC.md](CLAUDE_DESIGN_SYNC.md). The agent writes its own JSX and styles it with GST classes; it **cannot** import `.astro` components, and we never hand-write React versions of them.

**Guard against the ADR-0026 failure mode.** A previous design hand-off shipped three assumptions that did not survive contact with source: screenshot-derived measurements, a `role="tablist"` the page did not use, and two unresolvable slugs. So: **every value in the returned hand-off is a proposal until checked against the repo**, and the reviewer of Slice 3 checks them rather than trusting them. Say so in the doc when it lands.

#### The prompt to hand to Claude Design

```text
Design the sign-up page for a free 3-day trial of the GST MCP server — the
Model Context Protocol server that exposes GST's technical–diligence tooling
over an authenticated HTTP API.

AUDIENCE
A developer, or a technically sophisticated evaluator at a private-equity or
corp-dev firm who writes code. They arrived to answer one question: "is this
worth my time?" They are not a consumer signing up for a newsletter.

WHAT THE CREDENTIAL ACTUALLY IS — read before designing anything
A machine-to-machine OAuth client_credentials pair, for scripted and headless
use. It is NOT usable from Claude Desktop, Claude Code or Cursor: those
connect through a separate consent flow that requires an operator-issued key
this visitor does not have. Do not design tabs, config-file snippets or
custom headers for those clients.
The real flow is two steps:
  1. POST the client ID and secret to
     https://mcp.globalstrategic.tech/token with
     grant_type=client_credentials
  2. Receive a bearer token valid for ONE HOUR, and send it as
     Authorization: Bearer against https://mcp.globalstrategic.tech/mcp
There is no refresh token; the token is re-exchanged hourly. The official MCP
SDKs' ClientCredentialsProvider handles that loop.
Credential shapes: the client ID is `m2m_` followed by 22 base64url
characters; the secret is 32 random bytes, base64url, with no prefix. Use
those shapes for realistic dummy values — do not invent prefixes.

WHAT THE PAGE DOES
One action: the visitor clicks a button and immediately receives working API
credentials — a client ID and a client secret — that expire in 72 hours.
There is no email field, no password, no account, and no payment. Cloudflare
Turnstile runs invisibly in the background to block bots.

THE CRITICAL UX CONSTRAINT
The secret is displayed EXACTLY ONCE and can never be retrieved again. If the
visitor closes the tab without saving it, their only recourse is to sign up
again, which replaces it. The single most important job of this design is
making sure a competent person does not lose that secret. Offer both
copy-to-clipboard and download-as-file, and make the one-time nature
impossible to miss without resorting to alarm-styling on the whole page.

STATES TO DESIGN — all of them, not just the happy path
1. Idle — before the visitor acts. Must convey what the trial includes and
   what happens in 3 days. This page is the ONLY place that information
   appears; there is no public pricing table describing this tier.
2. Verifying — the invisible bot check is running. It renders NOTHING of its
   own, so this page must supply the entire sense of progress. Usually
   sub-second, occasionally several seconds.
3. Issued — credentials on screen. The most important state. Includes copy,
   download, and a clear next step. The next step is a LINK to a separate
   developer-onboarding page, plus at most a minimal inline taste of the
   token exchange. Do not design a full integration guide here, and do not
   invent one: if you need more wire detail than the section above gives
   you, say so rather than filling the gap.
4. Re-issued — the visitor already had a trial and signed up again. Same as
   Issued, plus an unmissable warning that their PREVIOUS secret has just
   stopped working, so anything already configured with it will break.
5. Errors, each needing its own treatment and its own recovery path:
   - bot check failed (retryable)
   - too many requests from this network (wait, retry later)
   - already used a trial and the previous one has expired (not retryable —
     explain what to do instead)
   - service unavailable (our fault; retryable)

REQUIREMENTS
- Use ONLY the GST design system synced to this project: existing tokens,
  .brutal-* classes, existing spacing scale. No new colours or type sizes.
- Must work in light AND dark theme AND all six palettes.
- Desktop-first, with breakpoints at 768px and 480px.
- The page is localized into English, Spanish and Brazilian Portuguese. Design
  every string to tolerate roughly 30% expansion without breaking layout, and
  avoid layouts that depend on a specific word length.
- WCAG 2.1 AA. The credential block and the state transitions must be usable
  by a screen reader — a state change that is only conveyed visually is a bug.
- The credential is long, monospace, and must be selectable and readable. Show
  the client ID and the secret as distinct labelled fields, not one blob.

WHAT NOT TO DO
- Do not design an email capture, an account, or a password.
- Do not design a pricing table or a paid-tier comparison — that surface is
  deliberately not part of this page.
- Do not design a visible CAPTCHA widget or checkbox. The bot check is
  invisible by design and renders nothing.
- Do not invent measurements from screenshots of the existing site; use the
  synced tokens.
- Do not design a Claude Desktop / Claude Code / Cursor integration, in any
  form — no client tabs, no claude_desktop_config.json, no X-GST-* headers.
  None of that exists and the credential cannot drive those clients.
- Do not invent endpoint hosts, credential prefixes, header names or
  parameter names. Everything you need is specified above; anything missing
  is a question to raise, not a blank to fill.

DELIVERABLE
An interactive HTML prototype showing all the states above at desktop, 768px
and 480px, in light and dark, with a written spec of the markup and the
classes used for each state.
```

### Slice 3 — Website signup surface

- **The signup page is Tier A — localized across every locale.** Operator decision: users arrive from multiple locales and must be able to sign up in their own. This reverses an earlier recommendation of English-only, which was made to save copy work and is overridden. Concretely, per LOCALIZATION.md and ADR-0030: a body template in `src/page-templates/`, one row in `TIER_A_ROUTES` (`src/i18n/routes.ts`) **and** one in the template registry (`src/page-templates/registry.ts`) — `tests/unit/i18n-locale.test.ts` holds those two lists to each other — plus catalogs in `en`, `es` and `pt-BR`, with `en` as the schema. **No literal user-visible strings in the template**; every string goes through `useTranslations(locale, ns)`, and `tests/unit/i18n-no-stray-literals.test.ts` fails on a quoted locale code or `/es/` path anywhere outside `src/i18n/locales.ts`.
  Note the copy includes error and edge states (challenge failed, already used a trial, rate-limited, credential issued) — all of which need translating, not just the happy path. Budget for that rather than discovering it.
- **Build to the Slice 3a hand-off**, not from scratch — and check its values against source rather than trusting them (ADR-0026). Recreate the behaviour in Astro using the repo's existing patterns; the prototype is a reference, never shipped code.
- Turnstile via **explicit rendering** with the **Invisible** widget: `<script src="…/api.js?render=explicit" defer>` plus `turnstile.render(el, { sitekey, callback })`. Invisible widgets run with no visible element, so the page must carry its own "verifying…" affordance — the widget provides none. Design-system tokens only; verify light/dark and all 6 palettes; desktop-first responsive.
- **The credential is shown once, on the page** — no email, so no BL-004 dependency. Make the one-time nature unmistakable in the copy, and offer both a copy-to-clipboard affordance (`src/utils/copy-feedback.ts` exists) **and a download** — a `.env` fragment or JSON built client-side from the mint response via a Blob URL, never sent to a server. The download is the preventive half of § Lost-credential recovery.
- **Copy must cover the re-issue path**, in all three locales: signing up again within the window returns a _new_ secret and **invalidates the old one**, so a client still configured with the previous credential will start failing. A visitor who does not know that will read a working-then-broken setup as a product bug.
- **CSP updated in BOTH `vercel.json` and `src/middleware.ts`** per SECURITY_HEADERS.md — `challenges.cloudflare.com` needs `script-src` and `frame-src`; the mint call needs the Worker origin in `connect-src`. Invisible mode still loads the same script and still uses a hidden iframe, so `frame-src` is required even though nothing is visible.
- **Privacy policy (Tier A, all three locales) gains the Turnstile disclosure** — a link to `https://www.cloudflare.com/turnstile-privacy-policy/` ("Turnstile Privacy Addendum"), covering both the Cloudflare condition of service for Invisible mode and GST's own IP-HMAC retention. Catalogs in `en`, `es`, `pt-BR` + `npm run i18n:stamp`. **Blocking, not follow-up.**
- **Do not reach for `INTERNAL_ENDPOINTS` in `src/middleware.ts`** — `isAnonymousProbe` 404s any request without a `Bearer` header before `next()`, and a visitor's browser has none. The page calls the Worker directly. (That Set is currently **empty** at `middleware.ts:41`, so this is a warning against re-populating it, not a description of something in the way.)
- E2E coverage per TEST_STRATEGY.md, and add the route to `tests/e2e/accessibility.test.ts`. **Turnstile cannot be solved in CI** — use Cloudflare's documented always-passes test sitekey, and assert the page's states (idle / verifying / issued / error) rather than driving a real challenge.

### Slice 3b — Published developer-onboarding page — ⚠ MOVED to the M2M initiative (2026-09-06 rescope)

**This slice is no longer part of BL-155.** A connector-flow trial needs no developer-onboarding page: [`/hub/mcp/get-started/`](../../pages/hub/mcp/get-started/index.astro) already documents the connector flow, and BL-155's issued state points there. The content below is retained **verbatim as the seed for the M2M initiative's equivalent slice** — it is researched and correct, and re-deriving it would waste the work. Move it, do not rewrite it.

Note one item that does **not** move: correcting [`get-started/index.astro:100`](../../pages/hub/mcp/get-started/index.astro) and `src/data/mcp/capabilities.ts:1343` where they say no self-serve signup exists. Under the rescope those become false the moment BL-155 ships, so the correction stays in BL-155's Slice 4 — and now points readers at the connector flow they are already reading about.

_Retained for the M2M initiative:_ **This is critical path, not a follow-on.** The trial mints an M2M `client_credentials` pair, and **nothing on the website documents how to use one.** [`/hub/mcp/get-started/`](../../pages/hub/mcp/get-started/index.astro) covers only the custom-connector flow, which a trial credential cannot drive (see § The trial is a developer credential). So without this page the signup page's success state has nowhere to point, and the failure lands _after_ the visitor has already spent their one-time secret. Ship it with Slice 3 or the trial does not work.

- **Seed it from [`mcp-server/src/docs/testing/uat/SETUP.md`](../../../mcp-server/src/docs/testing/uat/SETUP.md) § 0b and § 1b** — that doc already describes this exact flow from the recipient's side and is **client-safe by construction** ([PILOT_ONBOARDING.md:42](../../../mcp-server/src/docs/operations/PILOT_ONBOARDING.md) records why). Do **not** seed from [`operations/AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md): it is an operator doc carrying `$MCP_ADMIN_KEY` curls and the revocation runbook, and must never be reproduced on a public page. Read it for wire accuracy only.
- **The content is the two-step exchange**, stated concretely: `POST https://mcp.globalstrategic.tech/token` with `grant_type=client_credentials` → a `mcp_m2m_*` bearer → `Authorization: Bearer` against `https://mcp.globalstrategic.tech/mcp`.
- **Say the hourly re-exchange out loud.** The bearer lasts **one hour with no refresh token**. A developer who mistakes the first token for the credential is confused sixty minutes later and reads it as a product defect. Name the SDKs' `ClientCredentialsProvider` as the thing that handles the loop.
- **Do not describe a config-file or custom-header integration.** There are no `X-GST-Client-*` headers, and a trial credential pasted into `claude_desktop_config.json` cannot work. An early Claude Design mockup invented both — see § The trial is a developer credential for why, so nobody re-derives it.
- **Tier A — localized into `en`, `es`, `pt-BR`** (operator decision, 2026-09-06). Same mechanics as Slice 3: body template in `src/page-templates/`, a row in `TIER_A_ROUTES` (`src/i18n/routes.ts`) **and** one in `src/page-templates/registry.ts` (`tests/unit/i18n-locale.test.ts` holds the two lists to each other), catalogs with `en` as schema, no literal user-visible strings.
  **Note the inconsistency this creates and accept it deliberately:** `TIER_A_ROUTES` currently carries `/hub/mcp/` but **not** `/hub/mcp/get-started/`, so the sibling connector guide is English-only. After this slice the _self-serve_ onboarding page is localized while the _operator-issued_ one beside it is not. That is defensible — strangers arrive from any locale, roster pilots are onboarded by a human who speaks to them — but write it down, because it otherwise reads as an oversight and someone will "fix" it in the wrong direction.
- **Code blocks are not exempt from localization discipline.** The prose around them goes through catalogs; the commands themselves stay English. Decide the split explicitly so the catalogs do not end up carrying `curl` invocations that then drift across three files.
- **The issued state links here** rather than carrying instructions inline — one place to correct when the flow changes.
- **Route the corrected copy here, not to the connector guide.** Slice 4 already corrects [`get-started/index.astro:100`](../../pages/hub/mcp/get-started/index.astro) and `src/data/mcp/capabilities.ts:1343` where they say no self-serve signup exists. Those corrections must point a self-serve reader at _this_ page; sending them to the connector flow reproduces the original defect in prose.
- E2E coverage and a row in `tests/e2e/accessibility.test.ts`, as for any new route.

### Slice 4 — The record (ships with Slice 2, not after)

- **Amend ADR-0008** — append `## Amendment — <date> (BL-155): self-serve provisioning is permitted for a bounded trial tier`, and update its Status line. **Scope it wider than the trailing clause.** ADR-0008 `:18` is _"Identity = delegation over the existing key roster"_ — the consent page authenticates a human via their existing `MCP_KEY_*`, and grants carry `keyOwner OAUTH:<owner>` bounded by that key's scopes. A trial client has **no roster human behind it at all**, so what breaks is the identity _premise_, not just the "no self-serve signup" clause. The amendment must say plainly that for this one bounded case **the registration authority is an automated bot check**, and should engage the ADR's own DCR revisit trigger rather than stepping around it. The "still not DCR" argument holds on the letter — GST creates the client; the caller does not self-register — and should be stated that precisely, not more broadly. Also record: `trial` tier only, hard `expiresAt`, minimum scopes, **radar denied by the tier-scoped pipeline check — described as that mechanism, not as a scope exclusion**, since the scope-exclusion phrasing is exactly the overstatement withdrawn from Slice 2; the ≤1h token residual, the constant-`keyOwner`/per-client-limiter-subject split and why attribution and rate-limit identity are deliberately different here, and the revisit trigger if trials are farmed. The **no-user-directory half still stands** — a trial record is a credential record, not a user account.
- **Correct BL-093** — note the anchors moved when BL-154 was filed: the "Self-serve signup / user directory / dynamic client registration" out-of-scope bullet is at **`:1668`**, its closing "self-serve _signup_/DCR … remain out of scope as recorded" sentence at **`:1671`**, and the house strike-through + `**Amended <date>**:` form to copy is at **`:1628`**. Both statements are now false on their self-serve term. **Re-derive these line numbers at implementation time rather than trusting them** — this plan already carried one stale set.
- **`trial` stays undocumented on the public tier surface** (operator decision). `tests/integration/mcp-marketing-parity.test.ts:336-338` and `tests/e2e/hub-mcp-page.test.ts:16` (an **e2e** file — an earlier draft said `tests/unit/`, and no such copy exists) enumerate three tiers and should keep doing so, unchanged. Internal docs that mirror the tier table still get the row; public marketing copy does not. Note the consequence and accept it deliberately: the signup page offers a tier the pricing surface never mentions, so the page's own copy is the only place a visitor learns what they get.
- **Correct the public copy** that says otherwise — `src/pages/hub/mcp/get-started/index.astro:100` ("there is no self-serve signup and no dynamic client registration") and `src/data/mcp/capabilities.ts:1343`. **Directive 11: `grep tests/` for both strings before committing.**
- **BL-133's parked blockquote** must be updated to say the trial was unparked as BL-155 rather than left describing it as pending a Stripe staging pass.
- **Secrets, and their sequencing — which is a deploy hazard, not paperwork.** `TURNSTILE_SECRET_KEY` (plus the HMAC secret for the IP key) into `mcp-server/src/env.ts` beside `OAUTH_M2M_SIGNING_KEY`, both prose manifests in `wrangler.toml` (staging and production blocks separately), and rows in `SECRETS_INVENTORY.md`. Set via `wrangler secret put` reading stdin — never inline (Directive 15). The **site key is public** and belongs in the page.
  **Both `TURNSTILE_SECRET_KEY` and the IP-HMAC secret must exist in staging AND production before the code deploys.** The endpoint fails closed by design, so a merge that lands ahead of the secrets gives a 503 endpoint in production. Staging auto-deploys on a green MCP test run, and production is gated behind the `mcp-production` environment approval — so the order is: `wrangler secret put` both secrets in both environments → merge → let staging deploy → approve production. Do not invert it.
- **Docs that mirror the tier table and will drift**: `RATE_LIMITS.md:26-35, 178-185`, `PILOT_ONBOARDING.md:13, 34`, `testing/uat/SETUP.md:128`, `ARCHITECTURE.md:170`, `operations/AUTH.md:173-178`. Add a Turnstile row to `SECURITY_HEADERS.md`.
- **New BL-155 stanza** in BACKLOG.md carrying these ACs.

## Verification

1. **`npm -w @gst/mcp-server run typecheck && npm run test:mcp && npm run test:docs`** — mandatory, because this touches `mcp-server/`. Per Directive 14 the four website commands are _not_ sufficient: `astro check` excludes `mcp-server` and Vitest transpiles without type-checking, so an mcp-server type error passes everything else and still fails CI.
2. `npx astro check && npm run lint && npm run lint:css && npm run test:run` for the website half.
3. **Mutation-prove the guards, do not just watch them pass.** Each must be shown to fail with its check removed: expiry rejection at mint, Turnstile verification (including the `hostname`/`action` assertions, not just `success`), the one-per-identity constraint, the IP limiter, and **the tier-scoped radar deny** (named as that mechanism — "radar-scope exclusion" was the withdrawn claim, and a test named for it would prove a property the plan no longer asserts). A guard that has only ever passed is not known to probe anything.
4. **Explicitly test every fail-closed path** — assert a 503 with **nothing minted** for each of: unbound Upstash, unbound `OAUTH_KV`, a Turnstile siteverify that throws, and a siteverify that **hangs**. The hang case needs an explicit `AbortSignal` timeout on the fetch, or the 503 path is unreachable under a stalled upstream and the endpoint simply blocks. These are the highest-value tests in the change, because every neighbouring primitive in this Worker fails open and the natural mistake is to inherit that.
5. **Test mint atomicity, re-issue, and the TTL rules directly**: concurrent signups from one identity mint exactly one client; a mint that fails after the lease is won releases it rather than locking the visitor out; a repeat signup inside the window **rotates the secret on the existing record** — new secret works, old secret is refused at `POST /token`, `expiresAt` is **unchanged**, and **no second client record exists**; a repeat signup after `expiresAt` is refused rather than rotated; a PATCH clearing `expiresAt` (the `trial`→`paid` conversion) **also clears the reap**, and any other PATCH leaves the reap instant **where it was** rather than sliding it — which follows automatically from deriving it as `expiresAt + grace`, so the test is really asserting that derivation stayed idempotent. The `expiresAt`-unchanged assertion is the one that catches the unbounded-trial mistake. These branches are all easy to omit and invisible until a real outage or a real conversion.
6. Integration tests on `unstable_dev`, modelled on `tests/integration/oauth-m2m.test.ts:253-281` ("a deleted client cannot re-issue tokens") — same shape: create via admin, mutate, assert `POST /token` behaviour. Decode the `mcp_m2m_` payload and assert `tier === 'trial'` — the pattern is at `tests/unit/oauth/m2m-token.test.ts:86-98` ("round-trips the tier claim" / "surfaces the tier into the AuthSuccess result"). An earlier draft cited `:248`, which is a `tier: 'free-pilot'` fixture, not the assertion — the fifth stale citation this plan carried, hence the standing instruction to re-derive line numbers at implementation time.
7. E2E for the signup page with the always-passes test sitekey; light/dark and 6 palettes; axe on the new route.
8. **A real end-to-end exercise against staging — driven only by what the Slice 3b page tells a stranger to do.** Sign up, receive credentials, then follow that page's own instructions: exchange at `/token`, call `/mcp` with the bearer, and re-exchange after the hour to prove the loop is documented correctly. Do not substitute knowledge you have and the visitor does not — the page failing to say something is exactly the defect this exercise exists to catch. Note the connector clients are **not** part of this path (§ The trial is a developer credential); an exercise that reaches for Claude Desktop has left the supported flow. For expiry, **the primary method is minting a client with a past `expiresAt` via the admin API and proving the grant is refused** — not a fallback, since a 72h wall-clock wait is not a test anyone will repeat. Assert the ≤1h residual as expected behaviour too: a token minted before expiry keeps working until the JWT lapses, which is inherent to self-contained tokens and must not be filed as a bug. Directive 5: not done until proven.

## Sequencing note

Slice 1 is independent of every operator decision still open and is worth landing first on its own merits — PATCH alone removes a standing defect. Slices 2–4 land together, since the ADR amendment must not trail the code that contradicts it.

**Slice 3b is inside that bundle, not after it.** A signup page whose success state points nowhere is worse than no signup page: the visitor discovers the gap only after spending a one-time secret. If 3b is at risk of slipping, cut scope inside it (fewer examples, plainer page) rather than deferring it past Slice 3.
