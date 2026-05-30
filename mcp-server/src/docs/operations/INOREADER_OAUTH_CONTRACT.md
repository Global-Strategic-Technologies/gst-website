# Inoreader OAuth Contract — verified reference

**Purpose**: pin the Inoreader OAuth contract (success shape, error shape, rotation regime, TTL) as a single source of truth that BL-047 Tracks 1-4 scope against. The contract was verified 2026-05-30 against the official Inoreader Developer docs via Context7 (`/websites/inoreader_developers`) plus production-observed evidence from the BL-041 Phase 3 incident earlier that day.

**Status**: BL-047 T0 deliverable. Updated whenever the upstream contract changes or production observations contradict a claim here.

---

## 1. Endpoint

`POST https://www.inoreader.com/oauth2/token`

Content-Type: `application/x-www-form-urlencoded`. Both `authorization_code` and `refresh_token` grants share the same endpoint, differing only in the `grant_type` body param.

## 2. Refresh-token grant request

| Field           | Required | Notes                             |
| --------------- | -------- | --------------------------------- |
| `client_id`     | yes      | `INOREADER_APP_ID` Worker secret  |
| `client_secret` | yes      | `INOREADER_APP_KEY` Worker secret |
| `grant_type`    | yes      | Literal `refresh_token`           |
| `refresh_token` | yes      | The current refresh token         |

Wire-form is `application/x-www-form-urlencoded`, not JSON. Worker code: [`inoreader-oauth.ts`](../../lib/inoreader-oauth.ts).

## 3. Success response (HTTP 200)

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "scope": "read"
}
```

| Field           | Contract                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access_token`  | Always present on 200                                                                                                                                                                                                                       |
| `token_type`    | Always `"Bearer"`                                                                                                                                                                                                                           |
| `expires_in`    | Seconds until access-token expiry. Empirically ~3600 (1h) for our app. The contract permits any positive integer; do not hard-code 3600                                                                                                     |
| `refresh_token` | **Always present** on 200 per the upstream contract — "may be the same as the one provided" (Context7-cited Inoreader docs, 2026-05-30). Rotation is detected by comparing the response value to the request value, NOT by absence/presence |
| `scope`         | Mirror of the originally-granted scope. We request `read`; response echoes `read`                                                                                                                                                           |

### Implementation alignment

[`inoreader-oauth.ts:332`](../../lib/inoreader-oauth.ts) correctly compares `parsed.refresh_token !== refreshToken` rather than treating absence as "no rotation." If Inoreader ever changes the contract to omit `refresh_token` on echo, the guard `if (parsed.refresh_token && …)` makes that case safe (no write, current token preserved).

## 4. Error responses

Inoreader uses standard HTTP status codes; the `/developers/error-handling` page enumerates them. The token endpoint surfaces:

| Status | Meaning                                                            | Body shape (observed)                                             | Worker mapping                                                                                                   |
| ------ | ------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `400`  | Mandatory parameter missing/malformed                              | varies; often `{"error":"invalid_request"}` per RFC 6749          | `inoreader-error` (recoverable; transient client bug)                                                            |
| `401`  | **End-user not authorized** — refresh token revoked/expired/lapsed | `{"error":"invalid_grant"}` (observed 2026-05-30 BL-041 incident) | `invalid-refresh-token` → emit `oauth-refresh-invalid-refresh-token` Sentry event; requires manual OAuth re-link |
| `403`  | Incorrect AppID and/or AppSecret                                   | varies                                                            | `inoreader-error` (config bug — should never happen in steady state)                                             |
| `429`  | Daily limit reached (Zone-1 or Zone-2)                             | varies                                                            | Not an OAuth surface; relevant to `/reader/api/...` endpoints, not `/oauth2/token`                               |
| `503`  | Service unavailable                                                | varies                                                            | `inoreader-error` (transient; retry next cron)                                                                   |

### Sentry event-tag names

Worker code maps these error states to Sentry events via the `event` tag. The canonical tag values (composite strings, NOT just the `reason` field) are pinned in [`SENTRY_ALERT_RULES.md`](./SENTRY_ALERT_RULES.md) § 1 — operators writing Sentry filters should use those exact strings (`oauth-refresh-invalid-refresh-token`, `oauth-refresh-token-missing`, `oauth-refresh-upstash-write-failed`).

### Critical contract statement

Inoreader's own docs state: **"Upon receiving a 401, you should sign out the current user and prompt them to sign in again."**

This is the architecturally-stated recovery posture, and it directly justifies BL-047 T2 (Worker-served in-browser reauth flow). A 401 on refresh is not a retry-with-backoff state — it is a "re-collect user consent" state.

### Worker detection logic

[`inoreader-oauth.ts:290`](../../lib/inoreader-oauth.ts) catches the invalid-grant case via:

```ts
const isInvalidGrant = res.status === 401 || /invalid_grant/.test(bodyText);
```

This is intentionally permissive — it accepts both the documented 401 status and the RFC 6749 body shape, so a future Inoreader change that returns 400 + `invalid_grant` (matching the RFC more strictly) still triggers the correct path.

## 5. Refresh-token lifetime / TTL

**Inoreader publishes NO refresh-token TTL.** Verified absent from the official OAuth doc as of 2026-05-30. Production observation: our long-lived refresh tokens have run for weeks at a time without rotation, then died abruptly with no advance signal.

**Implication for BL-047 T4**: surface "age since last successful refresh" + "age since last rotation" rather than a "% of refresh-token TTL remaining" indicator. We cannot compute the latter without a documented TTL; age-since-last-success is the actual signal we have.

## 6. Rotation regime — open question

Observed reality (2026-05-13 BL-039 ship date through 2026-05-30): we have not yet captured production data on whether `refresh_token` is **always rotated** (every successful refresh returns a NEW refresh_token) or **rotated sparsely** (most refreshes return the SAME refresh_token, with rotation only on specific triggers).

**BL-047 T3 closes this**: emit `inoreader.oauth.refresh-token.rotated` Sentry event + `mcp:inoreader:rotations:<YYYY-MM-DD>` counter at the rotation branch of [`inoreader-oauth.ts:332`](../../lib/inoreader-oauth.ts). After 30 days of T3 data we can answer the regime question empirically.

**Why it matters**: if Inoreader is in a rotation regime (every refresh issues a new refresh_token), our cron's parallel-fetch races become more dangerous — the loser of a race writes a stale refresh_token. The existing single-flight lock at the OAuth boundary already mitigates this, but a known rotation regime would re-elevate the risk profile and likely justify Track-5-equivalent hedging. Until T3 ships, we assume the safer (rotation) regime by default.

## 7. Authorization grant (one-time setup)

For completeness — this is OUT of scope for BL-047 (T2 reuses the existing local `scripts/inoreader-auth.mjs setup` for first-time bootstrap, then ships the Worker reauth flow on top). Documented here so the contract reference is self-contained.

```
GET https://www.inoreader.com/oauth2/auth
  ?client_id=<APP_ID>
  &redirect_uri=<REDIRECT_URI>
  &response_type=code
  &scope=read
  &state=<CSRF_NONCE>
```

User consents; Inoreader 302s back to `redirect_uri?code=<CODE>&state=<NONCE>`. The Worker (T2) or local script (today) then POSTs:

```
POST /oauth2/token
  grant_type=authorization_code
  code=<CODE>
  redirect_uri=<REDIRECT_URI>   # must match exactly
  client_id=<APP_ID>
  client_secret=<APP_KEY>
```

Response shape: identical to the refresh-grant success body in § 3 above (`access_token`, `refresh_token`, `expires_in`, `scope`, `token_type`).

**redirect_uri equality**: Inoreader requires byte-exact match between the URI registered in the developer console and the URI used in both the `/oauth2/auth` GET and the `/oauth2/token` POST. BL-047 T2 must register BOTH staging and production callback URIs against the registered app before T2 ships.

## 8. Sources

- Context7 query 2026-05-30 against `/websites/inoreader_developers` — `inoreader.com/developers/oauth` + `inoreader.com/developers/error-handling`
- Production observation 2026-05-30 BL-041 Phase 3 incident — `oauth-refresh-invalid-refresh-token` Sentry event on `gst-mcp-server` project
- Worker implementation: [`mcp-server/src/lib/inoreader-oauth.ts`](../../lib/inoreader-oauth.ts)

**Re-verify cadence**: re-query Context7 + cross-check against the live `/oauth2/token` endpoint after any Inoreader-side breaking-change announcement, OR opportunistically every 6 months. Update this doc with the verification date in § 8 each time.
