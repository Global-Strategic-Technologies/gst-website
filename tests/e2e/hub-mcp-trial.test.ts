/**
 * /hub/mcp/trial/ — the self-serve trial signup (BL-155 Slice 3).
 *
 * Nothing here reaches Cloudflare or the Worker. Turnstile's api.js is
 * intercepted and replaced by a fake that issues a dummy token, and the mint
 * endpoint is fulfilled per test with one of the wire contract's responses,
 * so every state is driven deterministically and CI mints nothing real.
 * (The real always-pass test sitekey would work in a browser, but a live
 * mint from GitHub's runners would burn staging's per-network trial.)
 *
 * Clipboard: per TEST_BEST_PRACTICES anti-patterns 11 & 24, no clipboard
 * permission is granted; the assertions are the visible feedback and the
 * "saved" status the page owns.
 */
import { test, expect, type Page } from '@playwright/test';
import { checkA11y, formatViolations } from './helpers/a11y';

const ROUTE = '/hub/mcp/trial/';
const ID = 'm2m_Xk3pQ9rT2vB7nM4wL8sD1g';
const SECRET = '9fJ2kP5mR8vT1xW4zA7cE0hN3qU6yB9dG2iK5oL8sV1a';
const EXPIRES = '2026-09-10T21:17:28.969Z';
const ISSUED = '2026-09-07T21:17:28.969Z';

/** A stand-in for challenges.cloudflare.com/turnstile/v0/api.js. */
const FAKE_TURNSTILE = `
  window.turnstile = {
    _opts: null,
    render(el, opts) { this._opts = opts; return 'w1'; },
    reset() {},
    execute() { setTimeout(() => this._opts.callback('XXXX.DUMMY.TOKEN.XXXX'), 20); },
  };
  var m = /[?&]onload=([\\w$]+)/.exec(document.currentScript.src);
  if (m && window[m[1]]) window[m[1]]();
`;

type Mint = { status: number; body: unknown };

async function arm(page: Page, mint: Mint | Mint[]): Promise<void> {
  await page.route('**/turnstile/v0/api.js*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_TURNSTILE })
  );
  const queue = Array.isArray(mint) ? [...mint] : [mint];
  await page.route('**/trial/signup', (route) => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    return route.fulfill({
      status: next.status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(next.body),
    });
  });
  await page.goto(ROUTE);
  await page.waitForSelector('h1');
}

const issued = (extra: Record<string, unknown> = {}): Mint => ({
  status: 200,
  body: {
    credential: `${ID}:${SECRET}`,
    clientId: ID,
    expiresAt: EXPIRES,
    reissued: false,
    ...extra,
  },
});

test.describe('MCP trial signup — idle', () => {
  test('renders the shell, the three facts, two path cards and the once-warning', async ({
    page,
  }) => {
    await arm(page, issued());
    await expect(page.locator('h1')).toHaveText(/Try the GST MCP server for 3 days/);
    await expect(page.locator('.facts > div')).toHaveCount(3);
    await expect(page.locator('[data-fact="ceilings"]')).toHaveText(
      /^15 calls per minute, 100 per day/
    );
    const cards = page.locator('.brutal-gateway-grid .brutal-gateway-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).locator('.brutal-gateway-card__badge')).toHaveText('Most popular');
    await expect(cards.nth(0).locator('[data-start="connector"]')).toHaveText(
      'Issue trial credentials'
    );
    await expect(cards.nth(1).locator('[data-start="m2m"]')).toHaveText(
      'Issue a client ID and secret'
    );
    await expect(page.locator('[data-state="idle"] .brutal-callout__title')).toHaveText(
      'The secret is shown once'
    );
    // No third-party script until the visitor acts.
    expect(await page.evaluate(() => 'turnstile' in window)).toBe(false);
  });

  test('every control meets the 44px floor', async ({ page }) => {
    await arm(page, issued());
    for (const sel of ['[data-start="connector"]', '[data-start="m2m"]']) {
      const box = await page.locator(sel).boundingBox();
      expect(box?.height ?? 0, sel).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('MCP trial signup — connector flow', () => {
  test('issues, focuses the credentials heading, announces, and shows the trial key once', async ({
    page,
  }) => {
    await arm(page, issued());
    await page.click('[data-start="connector"]');
    // Verifying shows its own progress cue (Turnstile renders nothing).
    await expect(page.locator('[data-state="verifying"] [data-verify-title]')).toHaveText(
      'Verifying your browser'
    );
    const heading = page.locator('#cred-title');
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.locator('#cred-key')).toHaveText(`${ID}:${SECRET}`);
    await expect(page.locator('[data-expires]')).toHaveText(/Expires .*2026.* UTC · 72 h/);
    await expect(page.locator('[data-live]')).toHaveText(
      /Credentials issued\. The trial key is on screen/
    );
    await expect(page.locator('[data-reissue]')).toBeHidden();
    // Connector-only presentation: one field, "Copy key", the guide link.
    await expect(page.locator('#cred-id')).toBeHidden();
    await expect(page.locator('[data-copy="primary"]')).toHaveText('Copy key');
    await expect(
      page.locator('a.cta-button[href="/hub/mcp/get-started/#quick-start"]')
    ).toBeVisible();
    await expect(page.locator('[data-saved]')).toHaveText('Not saved yet');

    const violations = await checkA11y(page);
    expect(violations.critical, formatViolations(violations.critical)).toHaveLength(0);
    expect(violations.serious, formatViolations(violations.serious)).toHaveLength(0);
  });

  test('saved flips only when the secret leaves the page', async ({ page }) => {
    await arm(page, issued());
    await page.click('[data-start="connector"]');
    await expect(page.locator('#cred-title')).toBeVisible();
    // Copying the key IS the secret leaving the page.
    await page.click('[data-copy="key"]');
    await expect(page.locator('[data-copy="key"]')).toHaveText('Copied');
    await expect(page.locator('[data-saved]')).toHaveText('Secret copied');
    await expect(page.locator('[data-live]')).toHaveText('Trial key copied to clipboard');
  });

  test('beforeunload prompts while unsaved and stops after a save', async ({ page }) => {
    await arm(page, issued());
    await page.click('[data-start="connector"]');
    await expect(page.locator('#cred-title')).toBeVisible();
    const prompted = await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prompted).toBe(true);
    await page.click('[data-copy="primary"]');
    const afterSave = await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(afterSave).toBe(false);
  });

  test('re-issue puts the revoked alert first and names the previous issue date', async ({
    page,
  }) => {
    await arm(page, issued({ reissued: true, issuedAt: ISSUED }));
    await page.click('[data-start="connector"]');
    const alert = page.locator('[data-reissue]');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert.locator('.brutal-callout__title')).toHaveText(
      'Your previous secret has stopped working'
    );
    await expect(alert).toContainText(/issued on .*2026.* UTC were revoked/);
    // First thing in the issued block.
    await expect(page.locator('[data-state="issued"] > :first-child')).toHaveAttribute(
      'data-reissue',
      ''
    );
  });
});

test.describe('MCP trial signup — code flow', () => {
  test('shows the pair, the primary-bordered secret, and the two curl steps', async ({ page }) => {
    await arm(page, issued());
    await page.click('[data-start="m2m"]');
    await expect(page.locator('#cred-title')).toBeFocused();
    await expect(page.locator('#cred-id')).toHaveText(ID);
    await expect(page.locator('#cred-secret')).toHaveText(SECRET);
    await expect(page.locator('#cred-key')).toBeHidden();
    await expect(page.locator('[data-copy="primary"]')).toHaveText('Copy both');
    await expect(page.locator('[data-snippet="tok"]')).toContainText(`client_secret=${SECRET}`);
    await expect(page.locator('[data-snippet="tok"]')).toContainText('"token_type": "bearer"');
    await expect(page.locator('[data-snippet="call"]')).toContainText('tools/list');
    // Copying the client id alone does NOT save.
    await page.click('[data-copy="id"]');
    await expect(page.locator('[data-saved]')).toHaveText('Not saved yet');
    await page.click('[data-copy="secret"]');
    await expect(page.locator('[data-saved]')).toHaveText('Secret copied');
    // The snippet copy buttons keep their icon (no label swap) and are 44px.
    const box = await page.locator('[data-copy="tok"]').boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    const violations = await checkA11y(page);
    expect(violations.critical, formatViolations(violations.critical)).toHaveLength(0);
    expect(violations.serious, formatViolations(violations.serious)).toHaveLength(0);
  });
});

test.describe('MCP trial signup — errors', () => {
  const cases: {
    name: string;
    mint: Mint;
    kind: string;
    title: string;
    retry: boolean;
    contact: boolean;
    status: boolean;
  }[] = [
    {
      name: 'bot check failed',
      mint: { status: 400, body: { error: 'challenge-failed', retryable: true } },
      kind: 'bot',
      title: 'We couldn’t verify your browser',
      retry: true,
      contact: false,
      status: false,
    },
    {
      name: 'trial already used',
      mint: { status: 403, body: { error: 'trial-expired', issuedAt: ISSUED } },
      kind: 'expired',
      title: 'This network has already used its trial',
      retry: false,
      contact: true,
      status: false,
    },
    {
      name: 'service unavailable',
      mint: { status: 503, body: { error: 'unavailable' } },
      kind: 'unavail',
      title: 'The credential service is unavailable',
      retry: true,
      contact: false,
      status: true,
    },
  ];

  for (const c of cases) {
    test(`${c.name}: alert, edge class and recovery actions`, async ({ page }) => {
      await arm(page, c.mint);
      await page.click('[data-start="connector"]');
      const alert = page.locator('[data-error-callout]');
      await expect(alert).toBeVisible();
      await expect(alert).toHaveAttribute('role', 'alert');
      await expect(alert).toHaveAttribute('data-err-kind', c.kind);
      await expect(alert.locator('[data-err-title]')).toHaveText(c.title);
      await expect(page.locator('[data-live]')).toHaveText(`Request failed: ${c.title}`);
      await expect(page.locator('[data-retry]')).toBeVisible({ visible: c.retry });
      await expect(page.locator('[data-contact]')).toBeVisible({ visible: c.contact });
      await expect(page.locator('[data-status-link]')).toBeVisible({ visible: c.status });
      await expect(page.locator('[data-about]')).toHaveAttribute('href', '/hub/mcp/');
      const violations = await checkA11y(page);
      expect(violations.critical, formatViolations(violations.critical)).toHaveLength(0);
      expect(violations.serious, formatViolations(violations.serious)).toHaveLength(0);
    });
  }

  test('trial already used, record reaped: the dateless body', async ({ page }) => {
    await arm(page, { status: 403, body: { error: 'trial-expired' } });
    await page.click('[data-start="connector"]');
    await expect(page.locator('[data-err-body]')).toHaveText(/^A 3-day trial was already issued/);
    await expect(page.locator('[data-contact]')).toHaveAttribute(
      'href',
      '/hub/mcp/#request-access'
    );
  });

  test('too many requests: the retry button counts down from the body’s wait, then re-enables', async ({
    page,
  }) => {
    await arm(page, [
      { status: 429, body: { error: 'rate-limited', retryAfterSeconds: 2 } },
      issued(),
    ]);
    await page.click('[data-start="connector"]');
    const retry = page.locator('[data-retry]');
    await expect(retry).toBeDisabled();
    await expect(retry).toHaveText('Retry in 2 s');
    await expect(retry).toBeEnabled({ timeout: 5000 });
    await expect(retry).toHaveText('Try again');
    await expect(page.locator('[data-error-callout]')).toHaveAttribute('data-err-kind', 'rate');
    // Retrying re-runs the challenge and, with the queue advanced, issues.
    await retry.click();
    await expect(page.locator('#cred-title')).toBeVisible();
  });
});

test.describe('MCP trial signup — localized', () => {
  test('the Spanish route renders the Spanish copy and the same state machinery', async ({
    page,
  }) => {
    await page.route('**/turnstile/v0/api.js*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_TURNSTILE })
    );
    await page.route('**/trial/signup', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(issued().body),
      })
    );
    await page.goto('/es/hub/mcp/trial/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('h1')).toHaveText('Pruebe el servidor GST MCP por 3 días');
    await page.click('[data-start="connector"]');
    await expect(page.locator('#cred-title')).toHaveText('Credenciales de prueba');
    await expect(page.locator('[data-expires]')).toHaveText(/^Caduca el .* UTC · 72 h$/);
  });
});
