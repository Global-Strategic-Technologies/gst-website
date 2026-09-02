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
 * The same requests with every answer stripped: an unfilled template. It still
 * has request rows, so it converts — into a body of `<NO RESPONSE>` lines — and
 * that is what raises the advisory. Declared once; three tests need it.
 */
const BLANK_ROWS: (string | number)[][] = FILLED_ROWS.map((row) =>
  /^\d{1,2}-\d{2}$/.test(String(row[0] ?? '')) ? [row[0], row[1], 'OPEN', '', '', '', ''] : row
);

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

test.describe('IRL Extractor — the OUTPUT panel does not move', () => {
  // Scoped to the output panel because these two cases are about CONVERSION,
  // not about the advisory: swapping idle -> markdown must not resize it.
  //
  // Both panels grow TOGETHER when the advisory fires, and the case that shows
  // it is `an advisory never pushes…` in the other block — it asserts the pair
  // stays equal and that the output panel really grew. At the cap tier neither
  // panel grows, so `at the cap tier…` asserts zero movement instead; citing it
  // for growth (as an earlier draft of this comment did) gets it backwards.
  //
  // So "the layout does not move", what this block was called, is not true of
  // the shell in general. It is true of these swaps.
  //
  // Both cases use the LONG fixture. `FILLED_ROWS` is three requests, which
  // converts to a body far under the stacked tier's 420px, so the stacked
  // guard passed against the very CSS it was written to catch: a `min-height`
  // that only grows once the body exceeds it never got the chance.
  test('at desktop width, before and after a conversion', async ({ page }) => {
    await gotoTool(page);

    // Measured rather than asserted in prose, because the prose was wrong
    // once: three stacked states took the panel to ~2340px against a declared
    // 900px and nothing caught it.
    const panel = page.locator('.irl-ext__panel--out');
    const before = await panel.boundingBox();

    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(LONG_ROWS));
    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });

    const after = await panel.boundingBox();
    expect(before?.height).toBeTruthy();
    expect(after?.height).toBeCloseTo(before!.height, 0);
  });

  test('on the stacked tier, where all three Playwright projects are too wide to look', async ({
    page,
  }) => {
    // The ≤1024px layout stacks the panels and the shared height stops
    // applying, so it had no coverage at all — and `min-height: 420px` on the
    // body plus `max-height: 520px` on the readout let a long body grow the
    // panel by up to 100px on a state change.
    await page.setViewportSize({ width: 900, height: 1000 });
    await gotoTool(page);

    const panel = page.locator('.irl-ext__panel--out');
    const before = await panel.boundingBox();

    await pickWorkbook(page, 'acme-irl.xlsx', buildWorkbook(LONG_ROWS));
    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });

    // Guard against a fixture too small to exercise the regression: the body
    // must exceed the 420px basis, or a `min-height` bug cannot show itself.
    const overflows = await page
      .locator('#irl-ext-md')
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(overflows).toBe(true);

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
    // the contradictions count; the panels grow instead — both of them, to the
    // same height. 900px tall is the floor case, and the one a laptop hits.
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoTool(page);

    const outHeightBefore = (await page.locator('.irl-ext__panel--out').boundingBox())!.height;

    await pickWorkbook(page, 'blank-template.xlsx', buildWorkbook(BLANK_ROWS));
    await expect(page.locator('#irl-ext-advisory')).toBeVisible({ timeout: 10000 });

    // The pair stays a pair. The output panel used to hold its height while the
    // pick panel grew past it, which left a visible 87px step between two boxes
    // that read as one control. Both take the shared value as a floor and the
    // grid stretches the shorter to the taller, so they are equal here and the
    // output panel really did grow.
    const both = await page.evaluate(() => ({
      pick: document.querySelector('.irl-ext__panel--pick')!.getBoundingClientRect().height,
      out: document.querySelector('.irl-ext__panel--out')!.getBoundingClientRect().height,
    }));
    expect(both.out).toBeCloseTo(both.pick, 0);
    expect(both.out).toBeGreaterThan(outHeightBefore + 1);

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

  test('at the cap tier an advisory moves nothing at all', async ({ page }) => {
    // The floor-tier case above accepts an 87px downstream shift, because the
    // panel has no slack there. At the CAP tier it does, and the correct
    // behaviour is zero movement — which held until the diagnostics went to two
    // lines per row, ate the old 760px cap's remaining slack, and started
    // shifting the cap tier by 7px with nothing to catch it. The cap is 780px
    // with 12.64px of headroom, so a sixth diagnostic row or longer advisory
    // copy would re-break it; this is what refuses to let that happen quietly.
    await page.setViewportSize({ width: 1920, height: 1200 });
    await gotoTool(page);

    // Read positions in the DOCUMENT, not the viewport: `boundingBox().y` is
    // scroll-relative, so a page that scrolled by the shift amount would report
    // no movement and pass falsely.
    const frame = () =>
      page.evaluate(() => {
        const box = (sel: string) => {
          const r = document.querySelector(sel)!.getBoundingClientRect();
          return { height: r.height, top: r.top + window.scrollY };
        };
        return {
          pick: box('.irl-ext__panel--pick'),
          out: box('.irl-ext__panel--out'),
          cards: box('.irl-ext__cards'),
        };
      });

    const before = await frame();

    await pickWorkbook(page, 'blank-template.xlsx', buildWorkbook(BLANK_ROWS));
    await expect(page.locator('#irl-ext-advisory')).toBeVisible({ timeout: 10000 });

    const after = await frame();
    expect(after.out.height).toBeCloseTo(before.out.height, 0);
    expect(after.pick.height).toBeCloseTo(before.pick.height, 0);
    // Deliberately NO equality assertion here. At this tier both panels sit on
    // the same floor and neither exceeds it, so `out === pick` is a tautology
    // of the shared token: it passes even with the stretch removed and the old
    // fixed height restored, which is the regression it would appear to guard.
    // The floor-tier case is where equality is load-bearing and it is asserted
    // there, where it does fail under that mutation.
    //
    // Nothing below the shell moves either — the property in full.
    expect(after.cards.top).toBeCloseTo(before.cards.top, 0);
    // And the headroom is real rather than incidental: the advisory-state
    // content must still fit under the cap. Asserted separately, with a message,
    // so a failure names the cap instead of showing an opaque height diff.
    expect(
      after.pick.height,
      'advisory-state pick panel must fit under the 780px cap'
    ).toBeLessThanOrEqual(780);
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

  test('the bullet glyph takes the SHARED line-box offset, not a page-local number', async ({
    page,
  }) => {
    await gotoTool(page);

    // `.bullet-icon` in cards.css centres the 14px glyph on its own line box
    // with `calc((1lh - 14px) / 2)`, so it tracks whatever font-size and
    // leading it is dropped into. This page's selector out-specifies that rule,
    // and it used to re-declare `margin-top: 0.4rem` — a magic number that
    // silently replaced the derived one and left the glyph ~1.5px low.
    //
    // Asserted against the formula recomputed from the live line-height rather
    // than against a literal, so restyling the list cannot make this stale.
    const rows = page.locator('.irl-ext__card-list li');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const offset = await rows.nth(i).evaluate((li) => {
        const icon = li.querySelector('svg') as SVGElement;
        const box = icon.getBoundingClientRect();
        return {
          marginTop: parseFloat(getComputedStyle(icon).marginTop),
          expected: (parseFloat(getComputedStyle(li).lineHeight) - 14) / 2,
          // The RENDERED box, and width above all: `li` is a row-direction flex
          // container, so `flex-shrink` bites on the inline axis. Computed
          // height stays 14 whether or not the glyph squashes, which is why
          // asserting height alone could not catch the regression it sits next
          // to.
          width: box.width,
          height: box.height,
        };
      });
      expect(offset.width).toBeCloseTo(14, 1);
      expect(offset.height).toBeCloseTo(14, 1);
      expect(offset.marginTop).toBeCloseTo(offset.expected, 1);
    }
  });

  test('each diagnostic reads as a label above an indented value', async ({ page }) => {
    await gotoTool(page);

    const shape = await page.evaluate(() =>
      [...document.querySelectorAll('.irl-ext__diag-row')].map((row) => {
        const dt = row.querySelector('dt')!.getBoundingClientRect();
        const dd = row.querySelector('dd')!.getBoundingClientRect();
        return { stacked: dd.top >= dt.bottom - 1, indent: Math.round(dd.left - dt.left) };
      })
    );

    expect(shape.length).toBe(5);
    for (const row of shape) {
      // Beneath, not beside.
      expect(row.stacked).toBe(true);
      // …and indented, which is the only thing tying the value to its label
      // once they are on separate lines.
      expect(row.indent).toBeGreaterThan(8);
    }
    // Every value starts on the same left edge, which is the point of the
    // indent being a fixed token rather than content-dependent.
    expect(new Set(shape.map((r) => r.indent)).size).toBe(1);
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
    await pickWorkbook(page, 'blank-template.xlsx', buildWorkbook(BLANK_ROWS));

    await expect(page.locator('#irl-ext-md')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#irl-ext-error')).toBeHidden();
    await expect(page.locator('#irl-ext-md')).toContainText('<NO RESPONSE>');

    const advisory = page.locator('#irl-ext-advisory');
    await expect(advisory).toBeVisible();
    await expect(advisory).toContainText('not been filled in yet');
  });
});

test.describe('IRL Extractor — the size ceiling', () => {
  test('refuses a workbook past the ceiling without parsing it, and stays exclusively in error', async ({
    page,
  }) => {
    await gotoTool(page);

    // 16 MB of zeroes: past the 15 MB ceiling, and deliberately NOT a valid
    // .xlsx. With the guard removed, SheetJS does NOT throw on this — it reads
    // an empty `Sheet1` and the page lands on the ZERO-ROW branch (measured by
    // disabling the guard, not assumed). So the size copy is what separates the
    // guard from its nearest look-alike error; asserting a generic error state
    // would pass with the guard gone.
    //
    // The `15` below is hardcoded because MAX_FILE_MB is module-scoped in the
    // page script and cannot be imported. That is the point rather than a
    // limitation: this asserts the copy a visitor actually reads, so a literal
    // that drifted from the constant fails here.
    await pickWorkbook(page, 'vdr-export.xlsx', Buffer.alloc(16 * 1024 * 1024));

    const err = page.locator('#irl-ext-error');
    await expect(err).toBeVisible({ timeout: 10000 });
    // Exclusively error — `[hidden]` loses to an author-origin `display`, so
    // the sibling panels are asserted gone, not merely scrolled away.
    await expect(page.locator('#irl-ext-idle')).toBeHidden();
    await expect(page.locator('#irl-ext-md')).toBeHidden();

    const body = page.locator('#irl-ext-error-body');
    await expect(body).toContainText('16.0 MB');
    // The ceiling is rendered from MAX_FILE_MB; a literal that drifted from
    // the constant fails here.
    await expect(body).toContainText('up to 15 MB');
    await expect(page.locator('#irl-ext-status')).toContainText('File too large');
    await expect(page.locator('#irl-ext-actions')).toHaveAttribute('data-enabled', 'false');
    await expect(page.locator('#irl-ext-diag')).toHaveAttribute('data-empty', 'true');
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
