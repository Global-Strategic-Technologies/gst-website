import { test, expect, type Page } from '@playwright/test';
import { checkA11y, formatViolations } from './helpers/a11y';
// xlsx-js-style is CJS; the namespace-vs-default interop shape differs between
// the vitest and Playwright runners, so normalize to whichever carries `read`.
import * as XLSXImport from 'xlsx-js-style';
const XLSX = (XLSXImport as unknown as { default?: typeof XLSXImport }).default ?? XLSXImport;

const PAGE_URL = '/hub/tools/information-request-list-extractor/';

/**
 * Deep readiness gate. The client module's LAST statements are `showState('idle')`
 * + `resetDiag()`, and `resetDiag()` is what stamps `data-empty="true"` onto the
 * diagnostics block — so waiting on that attribute means every handler above it
 * (file input, drag/drop, copy, download) is attached. Per
 * TEST_BEST_PRACTICES § 26: wait on the signal that fires after all wiring, not
 * on a statically-rendered element.
 */
async function gotoTool(page: Page): Promise<void> {
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#irl-ext-drop', { timeout: 10000 });
  await page.waitForSelector('#irl-ext-diag[data-empty="true"]', { timeout: 10000 });
}

/**
 * A minimal IRL workbook, built in-process rather than committed as a binary
 * fixture. The column layout is the generator's contract:
 *   A Reference | B Request | C Status | D File Location | E Comments | F Notes | G Response
 */
function buildWorkbook(
  rows: (string | number)[][],
  sheetName = 'Information Request List'
): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const FILLED_ROWS: (string | number)[][] = [
  ['Target', 'Acme Co'],
  ['Engagement context', 'Value Creation'],
  ['Generated', '2026-05-23'],
  [],
  ['Reference', 'Request', 'Status', 'File Location', 'Comments', 'Notes', 'Response'],
  ['', '00 — Basics'],
  ['0-01', 'Company name', 'CLOSED', '', '', '', 'Acme Co, trading as Acme.'],
  [
    '0-02',
    'Engagement context',
    'CLOSED',
    'VDR/00/mandate.pdf',
    '',
    '',
    'Post-close value creation',
  ],
  ['0-03', 'Annual recurring revenue', 'OPEN', '', '', '', ''],
];

/**
 * Enough request rows that the converted body is taller than the readout box,
 * which is what makes the readout a scroll container in the first place. A
 * three-row workbook never overflows, so it cannot exercise the rule.
 */
const LONG_ROWS: (string | number)[][] = [
  ...FILLED_ROWS.slice(0, 6),
  ...Array.from({ length: 60 }, (_, i) => [
    `0-${String(i + 1).padStart(2, '0')}`,
    `Request number ${i + 1}`,
    'CLOSED',
    '',
    '',
    '',
    `Answer number ${i + 1}.`,
  ]),
];

/** Attach a workbook to the (visually hidden but present) file input. */
async function pickWorkbook(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.setInputFiles('#irl-ext-file', {
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
}

test.describe('IRL Extractor — conversion', () => {
  test('converts a filled workbook to canonical markdown in the browser', async ({ page }) => {
    await gotoTool(page);

    // Idle first, and EXCLUSIVELY idle. Asserting only that the markdown is
    // hidden let a real defect through: `[hidden]` loses to an author-origin
    // `display: flex`, so the error panel rendered full-size under the idle
    // box and `toBeVisible()` still passed for content 1500px down the page.
    await expect(page.locator('#irl-ext-idle')).toBeVisible();
    await expect(page.locator('#irl-ext-error')).toBeHidden();
    await expect(page.locator('#irl-ext-md')).toBeHidden();

    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));

    const md = page.locator('#irl-ext-md');
    await expect(md).toBeVisible({ timeout: 10000 });
    // …and the other two must be gone, not merely further down.
    await expect(page.locator('#irl-ext-idle')).toBeHidden();
    await expect(page.locator('#irl-ext-error')).toBeHidden();

    const text = await md.textContent();
    // The exact canonical shape — H1 with the (filled) suffix, the preamble
    // quote lines, and the bullet grammar the sweep consumes.
    expect(text).toContain('# Information Request List — Acme Co (filled)');
    expect(text).toContain('> Engagement context: Value Creation');
    expect(text).toContain('> Generated: 2026-05-23');
    expect(text).toContain('- 0-01 Company name [CLOSED] — Acme Co, trading as Acme.');
    expect(text).toContain(
      '- 0-02 Engagement context [CLOSED] — Post-close value creation (Source: VDR/00/mandate.pdf)'
    );
    expect(text).toContain('- 0-03 Annual recurring revenue [OPEN] — <NO RESPONSE>');
    // Section header rows are not bullets.
    expect(text).not.toContain('00 — Basics [');
  });

  test('reports the diagnostics the extractor actually returns', async ({ page }) => {
    await gotoTool(page);
    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));

    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#irl-ext-diag')).toHaveAttribute('data-empty', 'false');

    await expect(page.locator('#diag-bullets')).toHaveText('3');
    // Section NUMBERS, not titles — the extractor returns no titles.
    await expect(page.locator('#diag-sections')).toHaveText('00');
    await expect(page.locator('#diag-bytes')).toContainText('KB');

    await expect(page.locator('#irl-ext-status')).toContainText('3 requests');
    await expect(page.locator('#irl-ext-status')).toContainText('Information Request List');
  });

  test('enables the actions only once there is markdown, and copies it', async ({
    page,
    browserName,
  }) => {
    await gotoTool(page);

    // Inert before a pick — the buttons exist from first paint (so the layout
    // never shifts) but must not be operable.
    await expect(page.locator('#irl-ext-actions')).toHaveAttribute('data-enabled', 'false');
    await expect(page.locator('#irl-ext-copy')).toBeDisabled();

    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));
    await expect(page.locator('#irl-ext-actions')).toHaveAttribute('data-enabled', 'true', {
      timeout: 10000,
    });
    await expect(page.locator('#irl-ext-copy')).toBeEnabled();

    // Clipboard permissions are Chromium-only in this suite; granting them at
    // project level crashes mobile device contexts, so it is done per-test and
    // guarded by browserName (see TEST_BEST_PRACTICES / the Playwright note in
    // CLAUDE.md).
    test.skip(browserName !== 'chromium', 'clipboard permissions are chromium-only here');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.locator('#irl-ext-copy').click();
    await expect(page.locator('#irl-ext-copy')).toHaveText('Copied');

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('# Information Request List — Acme Co (filled)');
  });

  test('downloads the markdown as a .md named after the workbook', async ({ page }) => {
    await gotoTool(page);
    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));
    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('#irl-ext-download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('acme-irl.md');
  });
});

test.describe('IRL Extractor — the layout does not move', () => {
  test('the output panel is the same height before and after a conversion', async ({ page }) => {
    await gotoTool(page);

    // The whole point of the fixed-height panel and the always-mounted
    // controls. Measured rather than asserted in prose, because the prose was
    // wrong once: three stacked states took the panel to ~2340px against a
    // declared 900px and nothing caught it.
    const panel = page.locator('.irl-ext__panel--out');
    const before = await panel.boundingBox();

    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));
    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });

    const after = await panel.boundingBox();
    expect(before?.height).toBeTruthy();
    expect(after?.height).toBeCloseTo(before!.height, 0);
  });

  test('the output panel still holds its height on the stacked tier', async ({ page }) => {
    // The desktop guard above runs at desktop width in every project, so the
    // ≤1024px layout — where the panels stack and the shared height stops
    // applying — had no coverage at all, and a body over 420px grew the panel
    // by up to 100px on a state change.
    await page.setViewportSize({ width: 900, height: 1000 });
    await gotoTool(page);

    const panel = page.locator('.irl-ext__panel--out');
    const before = await panel.boundingBox();

    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(FILLED_ROWS));
    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });

    const after = await panel.boundingBox();
    expect(before?.height).toBeTruthy();
    expect(after?.height).toBeCloseTo(before!.height, 0);
  });
});

test.describe('IRL Extractor — a result is reachable, not just present', () => {
  test('no serious axe violation in the CONVERTED state, not only at first paint', async ({
    page,
  }) => {
    // The site-wide sweep in `accessibility.test.ts` scans the idle first
    // paint, where nothing overflows yet. Both of this page's scroll
    // containers only exist once a workbook has been converted, so the state
    // that actually ships was never scanned — and it shipped a serious
    // `scrollable-region-focusable` on the markdown readout.
    await gotoTool(page);
    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(LONG_ROWS));
    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });

    // Guard against a vacuous pass: the readout must genuinely overflow, or
    // the rule this test exists for cannot fire either way.
    const overflows = await page
      .locator('#irl-ext-md')
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(overflows).toBe(true);

    const violations = await checkA11y(page);
    expect(violations.critical, formatViolations(violations.critical)).toHaveLength(0);
    expect(violations.serious, formatViolations(violations.serious)).toHaveLength(0);
  });

  test('the scrolling readout carries a keyboard tab stop with an announceable name', async ({
    page,
  }) => {
    await gotoTool(page);
    const md = page.locator('#irl-ext-md');
    await expect(md).toHaveAttribute('tabindex', '0');
    await expect(md).toHaveAttribute('role', 'region');
    await expect(md).toHaveAttribute('aria-label', /markdown/i);
  });

  test('an advisory never pushes a diagnostic row out of the panel', async ({ page }) => {
    // At the clamp floor the advisory paragraph needs ~90px the panel does not
    // have. Scrolling the rows to make room hid three of the five, including
    // the contradictions count; the pick panel grows instead. 900px tall is
    // the floor case, and the one a laptop actually hits.
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoTool(page);

    const blank = FILLED_ROWS.map((row) =>
      /^\d{1,2}-\d{2}$/.test(String(row[0] ?? '')) ? [row[0], row[1], 'OPEN', '', '', '', ''] : row
    );
    await pickWorkbook(page, 'blank-template.xlsx', buildWorkbook(blank));
    await expect(page.locator('#irl-ext-advisory')).toBeVisible({ timeout: 10000 });

    const fits = await page.evaluate(() => {
      const panel = document.querySelector('.irl-ext__panel--pick') as HTMLElement;
      const rows = [...document.querySelectorAll('.irl-ext__diag-row')];
      const advisory = document.getElementById('irl-ext-advisory') as HTMLElement;
      const pb = panel.getBoundingClientRect().bottom;
      return {
        rowCount: rows.length,
        rowsInside: rows.filter((r) => r.getBoundingClientRect().bottom <= pb + 1).length,
        advisoryInside: advisory.getBoundingClientRect().bottom <= pb + 1,
        // Nothing in the panel may become a scroll container either: that is
        // the same axe rule as the readout, without the tab stop.
        panelScrolls: panel.scrollHeight > panel.clientHeight + 1,
        listScrolls: (() => {
          const l = document.querySelector('.irl-ext__diag-list') as HTMLElement;
          return l.scrollHeight > l.clientHeight + 1;
        })(),
      };
    });

    expect(fits.rowCount).toBe(5);
    expect(fits.rowsInside).toBe(5);
    expect(fits.advisoryInside).toBe(true);
    expect(fits.panelScrolls).toBe(false);
    expect(fits.listScrolls).toBe(false);
  });
});

test.describe('IRL Extractor — the page reads as one column', () => {
  test('the intro starts on the same left edge as the header and the shell', async ({ page }) => {
    await gotoTool(page);

    // The intro was centred (`margin: 0 auto`) while every other block ran the
    // full container width, which put its left edge ~310px inboard of the
    // title above it and the panels below it. Asserted as a measurement
    // because that is the property a reader sees.
    const left = async (selector: string) => (await page.locator(selector).boundingBox())?.x;

    const title = await left('.hub-header__title');
    expect(title).toBeTruthy();
    expect(await left('.irl-ext__intro')).toBeCloseTo(title!, 0);
    expect(await left('.irl-ext__shell')).toBeCloseTo(title!, 0);
    expect(await left('.irl-ext__cards')).toBeCloseTo(title!, 0);
  });

  test('each guidance bullet is an icon plus ONE span, not a row of flex items', async ({
    page,
  }) => {
    await gotoTool(page);

    // `li` is a flex container, so a bare text node beside an inline `code` or
    // `a` becomes its own anonymous flex item and wraps independently — which
    // rendered the first bullet as "Paste it into" beside a gap beside the
    // rest of its own sentence. Two children per row is the invariant that
    // keeps each sentence one run of text.
    const rows = page.locator('.irl-ext__card-list li');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const shape = await rows.nth(i).evaluate((li) => ({
        // Element children plus any text node carrying non-whitespace: every
        // one of these is a flex item.
        items: [...li.childNodes].filter(
          (n) => n.nodeType === 1 || (n.nodeType === 3 && (n.textContent ?? '').trim())
        ).length,
        tags: [...li.children].map((c) => c.tagName.toLowerCase()),
      }));
      expect(shape.items).toBe(2);
      expect(shape.tags).toEqual(['svg', 'span']);
    }
  });

  test('the guidance cards carry the frosted-glass treatment', async ({ page }) => {
    await gotoTool(page);

    // The control frost triple from STYLES_GUIDE § Frosted Glass. The edge
    // treatment is the part that reads on this site's flat ground, so a card
    // with the blur and none of the shadow is still the bug this guards.
    const cards = page.locator('.irl-ext__card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const style = await cards.nth(i).evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          backdropFilter: cs.backdropFilter,
          boxShadow: cs.boxShadow,
          background: cs.backgroundColor,
        };
      });
      expect(style.backdropFilter).toContain('blur');
      expect(style.boxShadow).toContain('inset');
      expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    }
  });
});

test.describe('IRL Extractor — an unfilled template', () => {
  test('converts, and says so, rather than reporting a failure', async ({ page }) => {
    await gotoTool(page);

    // A blank template still HAS request rows, so it converts into a body of
    // <NO RESPONSE> lines — exactly as the CLI does. Calling that a failure
    // would misreport the tool.
    const blank = FILLED_ROWS.map((row) =>
      /^\d{1,2}-\d{2}$/.test(String(row[0] ?? '')) ? [row[0], row[1], 'OPEN', '', '', '', ''] : row
    );
    await pickWorkbook(page, 'blank-template.xlsx', buildWorkbook(blank));

    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#irl-ext-error')).toBeHidden();
    await expect(page.locator('#irl-ext-md')).toContainText('<NO RESPONSE>');

    const advisory = page.locator('#irl-ext-advisory');
    await expect(advisory).toBeVisible();
    await expect(advisory).toContainText('not been filled in yet');
  });
});

test.describe('IRL Extractor — the zero-row path', () => {
  test('fails loudly on a workbook with no request rows, naming the sheet it read', async ({
    page,
  }) => {
    await gotoTool(page);

    await pickWorkbook(
      page,
      'q3-budget.xlsx',
      buildWorkbook(
        [
          ['Cost centre', 'Q3 actual', 'Q3 budget'],
          ['Platform', 412000, 400000],
        ],
        'Sheet1'
      )
    );

    const err = page.locator('#irl-ext-error');
    await expect(err).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#irl-ext-idle')).toBeHidden();
    await expect(page.locator('#irl-ext-md')).toBeHidden();
    // Names the sheet actually read — the reader falls back to the first sheet
    // when the primary one is absent, so this is the only honest signal.
    await expect(page.locator('#irl-ext-error-body')).toContainText('Sheet1');
    await expect(page.locator('#irl-ext-status')).toContainText('0 requests');
    // Actions must go back to inert rather than offering an empty body.
    await expect(page.locator('#irl-ext-actions')).toHaveAttribute('data-enabled', 'false');
  });
});
