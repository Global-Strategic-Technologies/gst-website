# Design hand-off: GST MCP self-serve trial sign-up — BL-155 (+ BL-156 presentation)

> **Status: open initiative doc.** This is the Claude Design hand-off for [BL-155](BACKLOG.md#bl-155-self-serve-3-day-mcp-trial--connector-flow-gated-by-turnstile-no-payment) (and the "From code" presentation that serves [BL-156](BACKLOG.md#bl-156-self-serve-m2m-credentials--the-developer-half-of-the-trial)), received 2026-09-07 and built the same day as [`HubMcpTrialPage.astro`](../../page-templates/HubMcpTrialPage.astro) at `/hub/mcp/trial/`. Its README and SPEC are reproduced verbatim below the horizontal rule with only file references adjusted. The strings file it shipped now lives as the `hub-mcp-trial` catalog (`src/i18n/<locale>/hub-mcp-trial.json`) and its `page-glue.css` is transcribed into the template's scoped `<style>`. The interactive prototype (`GST MCP Trial Sign-up.dc.html`, `support.js`, `_ds/`) is **not committed** — Claude Design is its source of truth, and its bundled stylesheet trips the repo's lint and token sweeps if left under `src/`. At closure this doc is archived per the [initiative-doc lifecycle](README.md#initiative-doc-lifecycle-convention-codified-2026-07-15-under-bl-088).
>
> **Every value below was a proposal until checked against source** (ADR-0026, as the design doc's § Slice 3a required). Three did not survive: the **ceilings** (the hand-off says 30/300, which is `free-pilot`; the trial tier is 15/100 in `mcp-server/src/ratelimit/tiers.ts`, and the page states that), the **request-access anchor** (`#request-access`, not `#request`), and the token snippet's **`token_type`** (`bearer` on the wire, not `Bearer`). Two of the six open questions needed Worker changes (`issuedAt` on the re-issue and expired responses; `retryAfterSeconds` in the 429 body) — answers are recorded under § Open questions, answered.

## Open questions, answered (2026-09-07)

1. **Trial key format** — yes: `<clientId>:<secret>`, split on the first colon by the consent page after the operator roster is tried (`mcp-server/src/oauth/consent-identity.ts`).
2. **`/token` response** — `access_token`, `token_type: "bearer"` (lowercase), `expires_in: 3600`; `client_secret_post` accepted for every M2M client, trial included.
3. **Clients to name** — Claude on the web and Claude Desktop only, as the get-started guide names and its parity test pins.
4. **BL-156 link vs inline** — inline two-step ships now; BL-156's "links to a page" criterion stays open with the interim recorded in its stanza.
5. **"No self-serve signup" copy** — corrected in `hub-mcp.json` (three locales), the get-started guide, `capabilities.ts`, `services.json`, `public/llms.txt` and the JSON-LD rationale; BL-093's out-of-scope bullet amended.
6. **Turnstile privacy disclosure** — satisfied by the privacy policy alone: a third-party item linking the Turnstile Privacy Addendum plus the 30-day IP-hash retention sentence, in all three locales.

---

# Handoff: GST MCP self-serve trial sign-up (BL-155 + BL-156)

## Overview

One page at `/hub/mcp/trial/` that issues a 3-day (72 h) trial credential for the GST MCP server with a single click. No email, account, password or card; an invisible Cloudflare Turnstile check is the only gate. The page serves two backlog items through one UX:

- **BL-155 (default, "From Claude")**: the visitor gets a single _trial key_ (`<clientId>:<secret>`) to paste at the existing consent page, then uses GST as a custom connector in Claude web / Claude Desktop.
- **BL-156 ("From code")**: the visitor gets a Client ID + Client secret pair for OAuth 2.1 `client_credentials`, exchanged at `/token` for an hourly bearer used against `/mcp`.

The page has one non-negotiable job: **the secret is shown exactly once and must not be lost.** Every design decision serves that (warning first, one emphasised field, copy/download tracked, `beforeunload` guard while unsaved).

## About the design files

`prototype/` is a **design reference built in HTML**, not production code. Recreate it in gst-website's Astro environment with the site's existing `.brutal-*` stylesheet, i18n JSON convention and layout components. Do not ship the prototype markup; do reuse its class vocabulary, copy and behaviour exactly.

Open `prototype/GST MCP Trial Sign-up.dc.html` in a browser. The top bar switches state (8), flow (2), width (1280 / 768 / 480), theme, palette (6), locale (EN / ES-CO / PT-BR) and bot-check speed. The page itself is the same file loaded with `?embed=1`.

## Fidelity

**High-fidelity.** Every colour, size, spacing and font comes from the GST stylesheet (`_ds_bundle.css` = the site's `styles.css`); zero new tokens. Match the class structure in the SPEC and the layout glue in `page-glue.css`. Copy is final in three locales, reviewed against the repo style guide (no em dashes).

## Screens / states

All states live inside one `section.brutal-tool-shell.brutal-tool-shell--fluid` (inline `max-width: 1040px; margin: 0 auto`; the DS `--wide` is 760px and too narrow for two cards) under the standard site header/footer. A `p.sr-only[role=status][aria-live=polite]` announces every transition. `div.state-region` has `min-height: 420px` on desktop so the shell does not jump between states; children fade in over `--transition-normal`.

Title `h1.brutal-heading-lg`: **never wraps**. `white-space: nowrap; font-size: clamp(var(--text-lg), 3.2vw, var(--text-3xl))`.

### 1. Idle

Order: facts row, two path cards, once-warning callout.

**Facts** `dl.facts` (3 col → 2 at 768 → 1 at 480). Each item: 2px top rule only; `dt.brutal-label-small` (`--text-primary`, nowrap, ellipsis) "Tools" / "Ceilings" / "After 72 hours"; `dd.brutal-text-tiny` (`--text-secondary`). Deliberately quiet: the cards are the CTA.

**Path cards** `.brutal-gateway-grid[role=group]` forced to `repeat(2, minmax(0,1fr))`, gap `--spacing-xl`; 1 col at 768 with `max-width: none` on the cards.

- Card A `article.brutal-gateway-card.brutal-frosted` (primary top rule): `h2` "From Claude"; 3 delta bullets (`svg.bullet-icon` + `span`); `span.brutal-gateway-card__badge` "Most popular" on its **own centred row directly above the button** (`margin-top: auto; align-self: center; margin-bottom: --spacing-md`; the following CTA gets `margin-top: 0`); `button.cta-button.brutal-gateway-card__cta` "Issue trial credentials". Click → flow = connector, state = verifying.
- Card B adds `.brutal-gateway-card--secondary` (page modifier: `border-top-color` = neutral border so only the recommended card has the primary edge): `h2` "From code"; 2 bullets; no badge; `button.brutal-btn.brutal-btn--secondary.brutal-gateway-card__cta` "Issue a client ID and secret". Click → flow = m2m, state = verifying.

Both CTAs `min-height: var(--touch-target-min)`. There is no separate selector or page-level button: choosing a path _is_ issuing.

**Once-warning** `.brutal-callout` title "The secret is shown once", body per flow (`onceBodyIdleC` for connector, `onceBodyIdle` for m2m).

### 2. Verifying

One progress indicator only: `.brutal-callout[role=status][aria-live=polite][aria-busy=true]` whose title holds 3 `span.brutal-skeleton-dot` (aria-hidden, `animation-delay` 0 / .25 s / .5 s) + "Verifying your browser"; body "Usually under a second. Please keep this page open." After 2.5 s the text swaps to `verifyLongTitle` / `verifyLongBody` (same element, so the live region re-announces). No button. Dots stop under `prefers-reduced-motion`.

### 3. Issued

Order: once-warning, credential panel, "use it" section.

**Once-warning** now `.brutal-callout.brutal-callout--warning[role=note]`, title colour `--color-warning`, body `onceBodyIssuedC` / `onceBodyIssued`.

**Panel** `section.brutal-panel[aria-labelledby=cred-title]`

- `.brutal-panel__header`: `h2#cred-title.brutal-panel__title[tabindex=-1]` "Trial credentials" (receives focus ~50 ms after issue); `span.brutal-panel__count` "Expires {date} UTC · 72 h" (allowed to wrap, right-aligned).
- Body (`padding: --spacing-lg`):
  - **connector**: one `.brutal-field`: label "Trial key" + `em.brutal-field__req` "shown once"; `.cred-grid` (`minmax(0,1fr) auto`, 1 col at 480) holding `output#cred-key.brutal-field__input` (block, `word-break: break-all`, `user-select: all`, `min-height: --touch-target-min`, **solid `--color-primary` border**) and `button.brutal-btn.brutal-btn--secondary` "Copy"; hint `p.brutal-field__hint.brutal-text-tiny` (`keyHint`). Value = `clientId + ':' + secret`.
  - **m2m**: two `.brutal-field`s: "Client ID" (`output#cred-id`, plain border) and "Client secret" + req "shown once" (`output#cred-secret`, primary border) each with a Copy button; hint `secretHint` under the secret.
- Footer (2px top rule, `padding: --spacing-md --spacing-lg`): `.btn-row` with `button.brutal-btn.brutal-btn--primary` ("Copy key" for connector, "Copy both" for m2m) and `button.brutal-btn.brutal-btn--secondary` "Download .json"; then `p[role=status].brutal-text-tiny` "Not saved yet" (`--color-warning`) → "Secret copied" / "File downloaded" (`--color-success`).

Copy buttons: on success add `.brutal-btn--copied`, label → "Copied" for 2 s, live region "{what} copied to clipboard". `saved` flips **only** when the secret itself leaves the page: copying the key, the secret, both, or downloading. Copying the client ID alone or a curl snippet leaves "Not saved yet". `beforeunload` prompts while `saved` is null in issued/reissued.

Download filename `gst-mcp-trial-credentials.json`:

```json
// connector
{ "consent_key": "<id>:<secret>", "client_id": "…", "client_secret": "…", "expires_at": "<ISO>", "mcp_url": "https://mcp.globalstrategic.tech/mcp", "flow": "connector", "guide_url": "https://globalstrategic.tech/hub/mcp/get-started/", "tier": "trial" }
// m2m
{ "client_id": "…", "client_secret": "…", "expires_at": "<ISO>", "mcp_url": "https://mcp.globalstrategic.tech/mcp", "token_url": "https://mcp.globalstrategic.tech/token", "grant_type": "client_credentials", "flow": "m2m", "tier": "trial" }
```

Credential formats (per `mcp-server/src/oauth/m2m-clients.ts`): client ID `m2m_` + 22 base64url chars; secret = 32 random bytes base64url, no prefix.

**"Use it" section**

- connector: `p.brutal-tool-shell__section-label` "Use it from Claude"; `p.brutal-text-small` (`cIntro`, max-width 64ch); `.btn-row` › `a.cta-button` "Open the connector guide" → `/hub/mcp/get-started/#quick-start`; `.brutal-callout` "The connection ends with the trial" (`cEndsBody`); `p.brutal-text-tiny` `cAfterExpiry`. No inline steps: the guide is the single source.
- m2m: section label "Use it from a script or pipeline"; intro `connectIntro`; `ol.steps` (list-style none, grid `auto minmax(0,1fr)`, gap `--spacing-md`): `span.brutal-data-sm` "01"/"02" in `--color-primary`, `h3.brutal-heading-sm`, `p.brutal-text-small`, then a `pre[tabindex=0]` (2px border, `--surface-subtle-bg`, `--font-family-mono`, `--text-sm`, `pre-wrap`) with a `button.brutal-panel__copy` labelled `copyStep1` / `copyStep2`; `.brutal-callout` "The token expires every hour" (`hourlyBody`); `p.brutal-text-tiny` `afterExpiry`.

Snippets (interpolate real values into step 01; note the built page writes `token_type` as `bearer`, the wire value):

```
curl -s -X POST https://mcp.globalstrategic.tech/token \
  -d grant_type=client_credentials \
  -d client_id=<clientId> \
  -d client_secret=<secret>

# { "access_token": "mcp_m2m_...", "token_type": "bearer", "expires_in": 3600 }
```

```
curl -s -X POST https://mcp.globalstrategic.tech/mcp \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### 4. Re-issued

Issued, plus **first** in the shell: `.brutal-callout.brutal-callout--warning[role=alert]` with `border-left-color: var(--color-error)` and title in `--color-error`: "Your previous secret has stopped working", body `revokedBody` with `{date}` = the revoked credential's issue date.

### 5. Errors

`.brutal-callout[role=alert]` (title + body) then `.btn-row`. Buttons go full-width at 480.

- **Bot check failed**: edge `--color-error`. "Try again" (`--primary`, re-runs verification) · "About the MCP server" (`--secondary`, `/hub/mcp/`).
- **Too many requests**: edge `--color-warning`. "Try again" disabled with live countdown `retryIn` ("Retry in {s} s") from 30, re-enables at 0 · "About the MCP server".
- **Trial already used**: edge `--color-subdued` (informational). No retry. "Request evaluation access" (`--primary`, `/hub/mcp/#request-access`) · "About the MCP server".
- **Service unavailable**: edge `--color-error`. "Try again" · "Status page" (`status.mcp.globalstrategic.tech`) · "About the MCP server".

## Interactions & behaviour

- Path CTA click → `flow` set, state `verifying`, Turnstile invisible challenge runs → POST mint with the token → `issued` (or `reissued` when the server reports a prior trial on this network) or one of four errors.
- Every state change: update the live region (`liveVerifying`, `liveIssued` / `liveIssuedC`, `liveError`), then fade the new block in. Focus moves to `#cred-title` on issue.
- Timings: long-verify copy at 2.5 s; copied feedback 2 s; rate-limit countdown 30 s (use the server's wait when present).
- Motion: only the fade and skeleton dots; both off under `prefers-reduced-motion`.
- Responsive: 768 collapses facts to 2 col, cards to 1 col, shell padding `--spacing-lg --spacing-md`, `state-region` min-height 0; 480 collapses facts and `.cred-grid` to 1 col, `.btn-row .brutal-btn` full width.
- Theme `html.dark-theme`, palettes `html.palette-0…5`: nothing page-specific; every colour is a token. Use `light-dark(var(--border-light), var(--border-dark-default))` for borders.

## State

```
flow:     'connector' | 'm2m'
st:       'idle' | 'verifying' | 'issued' | 'reissued' | 'err-bot' | 'err-rate' | 'err-expired' | 'err-unavail'
long:     boolean        // verifying > 2.5 s
clientId, secret, issuedAt, expiresAt, prevDate
copied:   'id' | 'secret' | 'key' | 'both' | 'tok' | 'call' | null   // 2 s feedback
saved:    'copied' | 'downloaded' | null                            // gates "Not saved yet" and beforeunload
retryIn:  number  // rate limit countdown
```

## Accessibility

WCAG 2.1 AA. One polite live region for state, copy and download outcomes; alerts use `role=alert`. Credential values are `<output>` labelled via `<label for>`; copy buttons carry `aria-describedby` to their value. All controls ≥ 44 px. Focus rings come from the DS classes. Strings tolerate 30 % expansion (ES/PT run 25–35 % longer): no fixed widths on text, credential values break at any character.

## Design tokens

None new. Everything references the GST stylesheet: `--color-primary`, `--color-warning`, `--color-error`, `--color-success`, `--color-subdued`, `--text-primary/-secondary/-muted`, `--surface-subtle-bg`, `--border-light` / `--border-dark-default`, `--spacing-xs…3xl`, `--text-sm/lg/3xl`, `--font-family-mono`, `--touch-target-min`, `--transition-normal`.

## Assets

GST delta mark (inline SVG, `stroke="currentColor"`) for the header and the `.bullet-icon` bullets; no images.

## Open questions for engineering (as received; answered above)

1. Trial key format literally `<clientId>:<secret>` and accepted by the consent page's single field?
2. `/token` response field names (`access_token`, `token_type`, `expires_in`) and whether `client_secret_post` (form-encoded) is accepted for trial clients.
3. Which clients to name in `connFeatures`: page follows `/hub/mcp/get-started/` (Claude web + Desktop); BL-155 also lists Claude Code and Cursor, whose steps are unpublished.
4. BL-156 AC says the issued state should _link_ to a developer page rather than carry instructions; that page does not exist, so the inline two-step ships until it does.
5. `access.provisioning.item1` ("no self-serve signup") and the onboarding-parity test must change with this page.
6. Turnstile privacy disclosure was removed from the page at design review; BL-155 lists it as a blocking AC. Confirm it is satisfied by the privacy policy alone.

---

# Markup & class spec (as received)

## One signup, two flows

Per BL-156 ("do not design a second front door"), both initiatives share one page, one mint call, one credential record and one set of states. The visitor picks the flow in **Idle**; the pick changes only how the credential is _presented_ in Issued / Re-issued and which "use it" section follows. Everything else (verifying, errors, once-warning, panel chrome, copy/download/saved tracking, live region, focus move) is identical.

|                       | Connector (BL-155, default)                                                                                                                                                                    | Script (BL-156)                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Credential shown      | one field, **Trial key** = `<clientId>:<secret>` (the consent form's single-field shape, decided 2026-09-06)                                                                                   | two fields, Client ID + Client secret                                                                        |
| Primary footer action | "Copy key"                                                                                                                                                                                     | "Copy both"                                                                                                  |
| Download JSON         | `consent_key`, `client_id`, `client_secret`, `expires_at`, `mcp_url`, `flow: connector`, `guide_url`, `tier: trial`                                                                            | `client_id`, `client_secret`, `expires_at`, `mcp_url`, `token_url`, `grant_type`, `flow: m2m`, `tier: trial` |
| "Use it" section      | one paragraph directing to the existing guide + `a.cta-button` "Open the connector guide" → /hub/mcp/get-started/#quick-start (no inline steps) + callout "The connection ends with the trial" | 2 curl steps (POST /token → bearer → /mcp) + hourly-expiry callout                                           |
| Once-warning wording  | "trial key"                                                                                                                                                                                    | "client secret"                                                                                              |

Choosing a path and issuing are one click; there is no separate selector or page-level CTA. `--secondary` is a page modifier (top rule in the border colour) so the recommended card is the only one with the primary edge. The connector flow is the default because BL-155 ships first and is the one a non-developer evaluator can complete.

## Page frame (all states)

```
main > .container > section.brutal-tool-shell.brutal-tool-shell--fluid[aria-labelledby=trial-title]  (max-width 1040px; margin 0 auto)
  .brutal-tool-shell__content
    p.brutal-tool-shell__authority      "GST MCP server · Free 3-day trial"
    h1#trial-title.brutal-heading-lg   nowrap; font-size clamp(--text-lg, 3.2vw, --text-3xl); never wraps
    p.sr-only[role=status][aria-live=polite][aria-atomic]   ← announces every state change
    div.state-region (min-height 420px on desktop; children fade in over --transition-normal)
      <state block>
```

The site header and footer are BaseLayout's; the hand-off's own top bar and footer were harness chrome and are not reproduced.

## Grounding (gst-website@master, 2026-09-06) — with corrections

- Endpoint `https://mcp.globalstrategic.tech/mcp`; token endpoint `/token`, `grant_type=client_credentials` → `mcp_m2m_*` bearer, 1 h, no refresh.
- ~~Trial maps to the `free-pilot` tier: 30/min, 300/day~~ **Corrected**: the `trial` tier is 15/min, 100/day (`ratelimit/tiers.ts`); radar is refused at the pipeline seam regardless of ceiling. Copy states these are non-contractual ceilings.
- Surfaces: 16 tools, library + regulation resources, gst\_ prompts.
- Links: MCP overview `/hub/mcp/`, status `status.mcp.globalstrategic.tech`, request access `/hub/mcp/#request-access`.
- Em dashes are prohibited in MCP copy; none are used.

## Where the M2M instructions live: proposal

No public GST page documents the client_credentials flow. Recommendation: **both, in this order** — ship the screen self-contained (a user who has just been handed a secret shown once should not have to leave the page to learn what to do with it), then add a durable developer reference (BL-156) and give the issued screen one "Full reference" link. Do not link it before it exists.
