/**
 * Trial signup page behaviour (`/hub/mcp/trial/`, BL-155 Slice 3).
 *
 * Every state block is server-rendered from the catalog and hidden; this
 * module shows one at a time, fills the values the server returns, and keeps
 * the loss-prevention contract the design specifies:
 *
 *   - one polite live region announces every transition, copy and download;
 *   - `saved` flips ONLY when the secret itself leaves the page (copying the
 *     key, the secret, both, or the token-exchange snippet; or downloading);
 *   - `beforeunload` prompts while unsaved in issued / reissued;
 *   - focus moves to the credentials heading ~50 ms after issue;
 *   - re-issue and errors are `role=alert`, already in the markup.
 *
 * Turnstile is loaded lazily on the first click (a reader who never signs up
 * never loads a third-party script), rendered explicitly as an INVISIBLE
 * widget with `execution: 'execute'`, and executed once per attempt: tokens
 * are single-use, so a retry resets the widget before executing again. The
 * widget renders nothing; the verifying callout is the whole progress cue.
 *
 * The strings that need interpolation (`{date}`, `{s}`, `{title}`, `{what}`)
 * arrive in a JSON block the template emits; everything else is already in
 * the DOM. No `astro:env` import here — the site key and mint origin come
 * from `data-*` on the page root, read in frontmatter.
 */
import { copyWithFeedback } from '../utils/copy-feedback';
import {
  buildDownload,
  classifyMintResponse,
  copySaves,
  DOWNLOAD_FILENAME,
  fill,
  formatUtc,
  mcpCallSnippet,
  tokenExchangeSnippet,
  type Flow,
  type MintOutcome,
} from '../utils/trial-signup-core';

type State =
  | 'idle'
  | 'verifying'
  | 'issued'
  | 'reissued'
  | 'err-bot'
  | 'err-rate'
  | 'err-expired'
  | 'err-unavail';

type CopyWhat = 'key' | 'id' | 'secret' | 'both' | 'tok' | 'call';

interface Strings {
  verifyTitle: string;
  verifyBody: string;
  verifyLongTitle: string;
  verifyLongBody: string;
  expires: string;
  revokedBody: string;
  errExpiredBody: string;
  errExpiredBodyNoDate: string;
  errBotTitle: string;
  errRateTitle: string;
  errExpiredTitle: string;
  errUnavailTitle: string;
  retry: string;
  retryIn: string;
  copy: string;
  copied: string;
  copyKey: string;
  copyBoth: string;
  keyLabel: string;
  clientId: string;
  clientSecret: string;
  snippetWhat: string;
  savedNone: string;
  savedCopied: string;
  savedDownloaded: string;
  liveVerifying: string;
  liveIssuedC: string;
  liveIssued: string;
  liveError: string;
  liveCopied: string;
  liveDownloaded: string;
}

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  execution: 'render' | 'execute';
  appearance: 'always' | 'execute' | 'interaction-only';
  callback: (token: string) => void;
  'error-callback': (code?: string) => void;
  'expired-callback': () => void;
  'timeout-callback': () => void;
}
interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __gstTurnstileReady?: () => void;
  }
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const TURNSTILE_ACTION = 'trial-signup'; // asserted server-side (trial/turnstile.ts)
const LONG_VERIFY_MS = 2500;
const FOCUS_DELAY_MS = 50;
const COPIED_MS = 2000;
const MINT_TIMEOUT_MS = 15_000;

const root = document.getElementById('gst-trial');
if (root) init(root);

function init(root: HTMLElement): void {
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const strings = JSON.parse(
    root.querySelector('[data-trial-strings]')?.textContent ?? '{}'
  ) as Strings;
  const siteKey = root.dataset.siteKey ?? '';
  const mintUrl = `${root.dataset.mintOrigin ?? ''}/trial/signup`;
  const lang = document.documentElement.lang || 'en';

  const live = q('[data-live]')!;
  const blocks = {
    idle: q('[data-state="idle"]')!,
    verifying: q('[data-state="verifying"]')!,
    issued: q('[data-state="issued"]')!,
    error: q('[data-state="error"]')!,
  };

  let state: State = 'idle';
  let flow: Flow = 'connector';
  let saved: 'copied' | 'downloaded' | null = null;
  let issued: Extract<MintOutcome, { kind: 'issued' }> | null = null;
  let longTimer: number | undefined;
  let retryTimer: number | undefined;
  let widgetId: string | null = null;
  let turnstileLoad: Promise<TurnstileApi> | null = null;

  // --- live region ------------------------------------------------------
  // Cleared then re-set from a macrotask so a repeated message is still a
  // change the accessibility tree sees (same reasoning as initCopyButtons).
  function announce(text: string): void {
    live.textContent = '';
    window.setTimeout(() => {
      live.textContent = text;
    }, 0);
  }

  // --- state -------------------------------------------------------------
  function show(next: State): void {
    state = next;
    root.dataset.trialState = next;
    const isIssued = next === 'issued' || next === 'reissued';
    const isError = next.startsWith('err-');
    blocks.idle.hidden = next !== 'idle';
    blocks.verifying.hidden = next !== 'verifying';
    blocks.issued.hidden = !isIssued;
    blocks.error.hidden = !isError;
    // Flow-specific copy: the once-warning body, the panel body, the "use it" section.
    for (const el of qa('[data-flow-block]')) el.hidden = el.dataset.flowBlock !== flow;
  }

  function reset(): void {
    window.clearTimeout(longTimer);
    window.clearInterval(retryTimer);
  }

  // --- verifying ---------------------------------------------------------
  function startVerifying(): void {
    reset();
    const title = q('[data-verify-title]')!;
    const body = q('[data-verify-body]')!;
    title.textContent = strings.verifyTitle;
    body.textContent = strings.verifyBody;
    show('verifying');
    announce(strings.liveVerifying);
    longTimer = window.setTimeout(() => {
      // Same element, new text: the status live region re-announces.
      title.textContent = strings.verifyLongTitle;
      body.textContent = strings.verifyLongBody;
    }, LONG_VERIFY_MS);
    void runChallenge();
  }

  function loadTurnstile(): Promise<TurnstileApi> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileLoad) return turnstileLoad;
    turnstileLoad = new Promise<TurnstileApi>((resolve, reject) => {
      window.__gstTurnstileReady = () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error('turnstile-missing'));
      };
      const s = document.createElement('script');
      s.src = `${TURNSTILE_SRC}?render=explicit&onload=__gstTurnstileReady`;
      s.async = true;
      s.onerror = () => reject(new Error('turnstile-load-failed'));
      document.head.appendChild(s);
    });
    return turnstileLoad;
  }

  // The widget is rendered ONCE; its callbacks dispatch to whichever attempt
  // is current. A retry resets the widget (tokens are single-use) and
  // executes again, and the same callbacks settle the new attempt.
  let attempt: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

  function challenge(ts: TurnstileApi): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      attempt = { resolve, reject };
      if (widgetId === null) {
        widgetId = ts.render(q('[data-turnstile]')!, {
          sitekey: siteKey,
          action: TURNSTILE_ACTION,
          execution: 'execute',
          appearance: 'execute',
          callback: (t) => attempt?.resolve(t),
          'error-callback': (code) => attempt?.reject(new Error(code ?? 'error')),
          'expired-callback': () => attempt?.reject(new Error('expired')),
          'timeout-callback': () => attempt?.reject(new Error('timeout')),
        });
      } else {
        ts.reset(widgetId);
      }
      ts.execute(widgetId);
    });
  }

  async function runChallenge(): Promise<void> {
    let ts: TurnstileApi;
    try {
      ts = await loadTurnstile();
    } catch {
      fail({ kind: 'err-unavail' });
      return;
    }
    if (state !== 'verifying') return;
    let token: string;
    try {
      token = await challenge(ts);
    } catch {
      fail({ kind: 'err-bot' });
      return;
    }
    if (state !== 'verifying') return;
    await mint(token);
  }

  async function mint(token: string): Promise<void> {
    let outcome: MintOutcome;
    try {
      const res = await fetch(mintUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken: token }),
        signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      outcome = classifyMintResponse(res.status, body);
    } catch {
      outcome = { kind: 'err-unavail' };
    }
    if (state !== 'verifying') return;
    if (outcome.kind === 'issued') issue(outcome);
    else fail(outcome);
  }

  // --- issued / reissued -------------------------------------------------
  function issue(o: Extract<MintOutcome, { kind: 'issued' }>): void {
    reset();
    issued = o;
    saved = null;
    const consentKey = o.credential;

    q('[data-expires]')!.textContent = fill(strings.expires, {
      date: formatUtc(o.expiresAt, lang),
    });
    q('[data-cred-key]')!.textContent = consentKey;
    q('[data-cred-id]')!.textContent = o.clientId;
    q('[data-cred-secret]')!.textContent = o.secret;
    q('[data-snippet="tok"]')!.textContent = tokenExchangeSnippet(o.clientId, o.secret);
    q('[data-snippet="call"]')!.textContent = mcpCallSnippet();
    q('[data-copy="primary"]')!.textContent =
      flow === 'connector' ? strings.copyKey : strings.copyBoth;

    const reissue = q('[data-reissue]')!;
    reissue.hidden = !o.reissued;
    if (o.reissued) {
      q('[data-revoked-body]')!.textContent = fill(strings.revokedBody, {
        date: o.issuedAt ? formatUtc(o.issuedAt, lang) : '',
      });
    }
    renderSaved();
    show(o.reissued ? 'reissued' : 'issued');
    announce(flow === 'connector' ? strings.liveIssuedC : strings.liveIssued);
    window.setTimeout(() => q('#cred-title')?.focus({ preventScroll: false }), FOCUS_DELAY_MS);
  }

  function renderSaved(): void {
    const el = q('[data-saved]')!;
    el.textContent =
      saved === 'downloaded'
        ? strings.savedDownloaded
        : saved === 'copied'
          ? strings.savedCopied
          : strings.savedNone;
    el.dataset.savedState = saved ?? 'none';
  }

  function copy(what: CopyWhat, button: HTMLElement): void {
    if (!issued) return;
    const consentKey = issued.credential;
    let text = '';
    let label = '';
    switch (what) {
      case 'key':
        text = consentKey;
        label = strings.keyLabel;
        break;
      case 'id':
        text = issued.clientId;
        label = strings.clientId;
        break;
      case 'secret':
        text = issued.secret;
        label = strings.clientSecret;
        break;
      case 'both':
        text = `${strings.clientId}: ${issued.clientId}\n${strings.clientSecret}: ${issued.secret}`;
        label = strings.copyBoth;
        break;
      case 'tok':
        text = tokenExchangeSnippet(issued.clientId, issued.secret);
        label = strings.snippetWhat;
        break;
      case 'call':
        text = mcpCallSnippet();
        label = strings.snippetWhat;
        break;
    }
    const iconOnly = button.classList.contains('brutal-panel__copy');
    void copyWithFeedback(text, button, {
      label: strings.copied,
      duration: COPIED_MS,
      copiedClass: 'brutal-btn--copied',
      // Icon buttons keep their icon: the "Copied" swap lands on a detached span.
      feedbackTarget: iconOnly ? document.createElement('span') : undefined,
    });
    if (copySaves(what)) {
      saved = 'copied';
      renderSaved();
    }
    announce(fill(strings.liveCopied, { what: label }));
  }

  function download(): void {
    if (!issued) return;
    const data = buildDownload(flow, issued.clientId, issued.secret, issued.expiresAt);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = DOWNLOAD_FILENAME;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    saved = 'downloaded';
    renderSaved();
    announce(strings.liveDownloaded);
  }

  // --- errors --------------------------------------------------------------
  function fail(o: Exclude<MintOutcome, { kind: 'issued' }>): void {
    reset();
    const callout = q('[data-error-callout]')!;
    const titleEl = q('[data-err-title]')!;
    const bodyEl = q('[data-err-body]')!;
    const retryBtn = q<HTMLButtonElement>('[data-retry]')!;
    const contact = q('[data-contact]')!;
    const status = q('[data-status-link]')!;

    const kind = o.kind;
    callout.dataset.errKind = kind.slice('err-'.length);
    const title = {
      'err-bot': strings.errBotTitle,
      'err-rate': strings.errRateTitle,
      'err-expired': strings.errExpiredTitle,
      'err-unavail': strings.errUnavailTitle,
    }[kind];
    titleEl.textContent = title;
    // Bodies for bot / rate / unavail are static in the markup (data-err-static);
    // expired is interpolated and has a dateless variant.
    for (const el of qa('[data-err-static]')) el.hidden = el.dataset.errStatic !== kind;
    if (kind === 'err-expired') {
      bodyEl.textContent = o.issuedAt
        ? fill(strings.errExpiredBody, { date: formatUtc(o.issuedAt, lang) })
        : strings.errExpiredBodyNoDate;
    } else {
      bodyEl.textContent = '';
    }
    retryBtn.hidden = kind === 'err-expired';
    contact.hidden = kind !== 'err-expired';
    status.hidden = kind !== 'err-unavail';
    retryBtn.disabled = false;
    retryBtn.textContent = strings.retry;
    show(kind);
    announce(fill(strings.liveError, { title }));

    if (kind === 'err-rate') {
      let s = o.retryAfterSeconds;
      retryBtn.disabled = true;
      retryBtn.textContent = fill(strings.retryIn, { s });
      retryTimer = window.setInterval(() => {
        s -= 1;
        if (s <= 0) {
          window.clearInterval(retryTimer);
          retryBtn.disabled = false;
          retryBtn.textContent = strings.retry;
        } else {
          retryBtn.textContent = fill(strings.retryIn, { s });
        }
      }, 1000);
    }
  }

  // --- wiring ----------------------------------------------------------------
  for (const btn of qa<HTMLButtonElement>('[data-start]')) {
    btn.addEventListener('click', () => {
      flow = (btn.dataset.start as Flow) ?? 'connector';
      startVerifying();
    });
  }
  q('[data-retry]')!.addEventListener('click', () => startVerifying());
  for (const btn of qa<HTMLButtonElement>('[data-copy]')) {
    btn.addEventListener('click', () => {
      const what =
        btn.dataset.copy === 'primary' ? (flow === 'connector' ? 'key' : 'both') : btn.dataset.copy;
      copy(what as CopyWhat, btn);
    });
  }
  q('[data-download]')!.addEventListener('click', download);
  window.addEventListener('beforeunload', (e) => {
    // `preventDefault()` is the standard signal; the deprecated `returnValue`
    // form is not needed by any browser the site targets.
    if ((state === 'issued' || state === 'reissued') && saved === null) e.preventDefault();
  });

  show('idle');
}

export {};
