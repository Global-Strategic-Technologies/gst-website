/**
 * `tokenExchangeCallback` for the embedded OAuth provider (BL-155 Slice 2b).
 *
 * Binds a time-boxed consent grant to the record's `expiresAt`, which the
 * consent page stashes in the grant props. Connector grants carry refresh
 * tokens, so without this a grant minted at T+71h could refresh forever and
 * the trial would never end.
 *
 * How the binding works (verified against the installed
 * `@cloudflare/workers-oauth-provider` 0.10.3, `dist/oauth-provider.js`):
 *   - On the `authorization_code` exchange the callback returns
 *     `refreshTokenTTL` = seconds until `expiresAt`. The library honours it
 *     there (`:1939`, `:1964`) — the GRANT record itself expires — and then
 *     refuses any refresh of a lapsed grant at `:2016-2019`, BEFORE this
 *     callback runs. That library check is the enforcement; there is no
 *     "throw past expiry" belt here because it would be unreachable, and
 *     importing `OAuthError` would drag `cloudflare:workers` into the unit
 *     test graph.
 *   - `accessTokenTTL` is clamped to the remaining lifetime on BOTH grant
 *     types. The library clamps it on refresh (`:2077-2082`) but NOT on the
 *     auth-code exchange, where the provider-level 3600 applies unclamped —
 *     so a consent at T+71h30m would otherwise hold a token past the trial.
 *     The refresh-side clamp duplicates the library's; kept so both branches
 *     read the same and the unit test pins one rule.
 *   - `refreshTokenTTL` is NEVER returned on a refresh exchange — in 0.10.3
 *     that is a hard `invalid_request` 400 (`:2056`), despite the d.ts
 *     comment saying it is ignored.
 *   - The 60 s floor matches the library's own minimum token TTL (`:2853`).
 *     In a trial's final minute the library's refresh clamp may then refuse
 *     with `invalid_request` rather than `invalid_grant` — cosmetic, noted
 *     in AUTH.md.
 *
 * The hard stop for an access token that outlives `expiresAt` anyway is
 * `api-handler.ts`, which refuses a validated token whose props are past
 * expiry — zero KV, every request.
 *
 * NON-TRIAL GRANTS EXIT AT THE FIRST LINE. This callback is wired for every
 * grant the provider issues, including every existing pilot's; props with no
 * parseable `expiresAt` return `undefined`, which the library treats as "no
 * change". The unit test that pins that return is the regression guard for
 * the whole slice.
 *
 * Typed structurally (no import from the provider package) so the module is
 * loadable in the node vitest pool; `provider.ts` passes it straight in.
 */

export interface ExchangeInput {
  grantType: string;
  props: unknown;
}

export interface ExchangeOverride {
  accessTokenTTL?: number;
  refreshTokenTTL?: number;
}

/** Provider-level access-token TTL (`provider.ts`) — the cap, never exceeded here. */
const ACCESS_TOKEN_TTL_S = 3600;
/** KV / library minimum for any token TTL. */
const MIN_TTL_S = 60;

export function trialTokenExchange(
  input: ExchangeInput,
  now: number = Date.now()
): ExchangeOverride | undefined {
  const props = input.props as { expiresAt?: unknown } | null | undefined;
  const raw = props?.expiresAt;
  const expiresAt = typeof raw === 'string' ? Date.parse(raw) : NaN;
  if (Number.isNaN(expiresAt)) return undefined; // not time-boxed — untouched

  const remaining = Math.max(MIN_TTL_S, Math.ceil((expiresAt - now) / 1000));
  const accessTokenTTL = Math.min(ACCESS_TOKEN_TTL_S, remaining);

  if (input.grantType === 'authorization_code') {
    return { accessTokenTTL, refreshTokenTTL: remaining };
  }
  if (input.grantType === 'refresh_token') {
    return { accessTokenTTL };
  }
  return undefined;
}
