/**
 * /hub/mcp/docs/ — the two-lens capability reference.
 *
 * The registry's own correctness (identifiers, counts, orchestration lists,
 * copy rules) is asserted statically in
 * `tests/integration/mcp-docs-parity.test.ts`. This suite covers what only a
 * browser can: the lens swap, `:target`-driven contract selection, the search
 * combobox, and the no-JS reading of the same document.
 *
 * Visibility is asserted as COMPUTED CSS rather than by class name
 * (TEST_BEST_PRACTICES anti-pattern 4): the whole mechanism here is a cascade,
 * so a class assertion would pass against a broken one. The JS-gated search
 * field is asserted the same way rather than through a bare `toBeHidden()`
 * (anti-pattern 8). Copy is asserted as the label swap, never clipboard
 * contents (anti-patterns 11 & 24).
 */
import { test, expect, type Page } from '@playwright/test';
import { CAPABILITIES } from '../../src/data/mcp/capabilities';

const ROUTE = '/hub/mcp/docs/';

/** Every note paragraph the panes should carry: argument notes plus the
 *  Orchestrates preamble. Derived so a registry edit moves it, not a rewrite. */
const EXPECTED_NOTES =
  CAPABILITIES.filter((cap) => cap.argNote).length +
  CAPABILITIES.filter((cap) => cap.orchestrates).length;

/** Which lens is actually rendered, read from the cascade. */
async function visibleLenses(page: Page): Promise<string[]> {
  return page
    .locator('.mdoc-lens')
    .evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.id)
    );
}

/** Which contract panes are actually rendered. */
async function visiblePaneIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-pane]')
    .evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.id)
    );
}

test.describe('MCP documentation — page shape', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForSelector('h1');
  });

  test('renders the page title and breadcrumb', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('MCP Documentation');
    const crumb = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(crumb).toContainText('Documentation');
    // One breadcrumb landmark: the prototype's per-contract crumb is not ported
    // precisely because a second one is a duplicate landmark.
    await expect(crumb).toHaveCount(1);
  });

  test('opens on Jobs with all twelve rows', async ({ page }) => {
    await expect.poll(() => visibleLenses(page)).toEqual(['jobs']);
    await expect(page.locator('.mdoc-job')).toHaveCount(12);
    // Every step is an anchor into a contract. Step counts run 1 to 4 per job:
    // extracting a record runs one prompt that calls nothing, while the
    // regulatory map carries four, reading the framework documents after
    // searching them.
    await expect(page.locator('.mdoc-step')).toHaveCount(30);
  });

  test('every job names what it returns, on its collapsed row', async ({ page }) => {
    // The lens header promises "what you get back" on every job, and the whole
    // point of the index is that you get it WITHOUT opening anything, so this
    // asserts it on the summary while every row is still closed.
    await expect(page.locator('.mdoc-job__yield')).toHaveCount(12);
    const blank = await page
      .locator('.mdoc-job__yield')
      .evaluateAll((els) => els.filter((el) => !(el.textContent ?? '').trim()));
    expect(blank).toEqual([]);
    // The caption is deliberately gone: the lens header carries it once, so
    // repeating it on every row was noise. Guarded so it does not creep back.
    await expect(page.locator('.mdoc-job__yield-label')).toHaveCount(0);
  });

  test('opens on a fully collapsed index, and a row opens its steps in place', async ({ page }) => {
    // Collapsed is the resting state: twelve rows, no step visible, no row
    // privileged over another.
    const rows = page.locator('details.mdoc-job');
    const openCount = () =>
      rows.evaluateAll((els) => els.filter((el) => (el as HTMLDetailsElement).open).length);
    expect(await rows.count()).toBe(12);
    expect(await openCount()).toBe(0);
    // The disclosure indicator is the shared brand utility, not a bespoke
    // chevron: this row shipped once with a hand-rolled SVG, and the utility is
    // what carries the rotation, the collapsed muting and the palette response.
    await expect(page.locator('.mdoc-job__sum .delta-chevron')).toHaveCount(12);
    // ...and it LEADS the row. That is a deliberate deviation from the
    // inline-end rule the rest of the site follows (ADR-0026 § Amendment), so
    // it is pinned rather than left to look like an oversight someone should
    // tidy up.
    const leads = await page
      .locator('.mdoc-job')
      .first()
      .evaluate((row) => {
        const d = row.querySelector('.delta-chevron')!.getBoundingClientRect();
        const n = row.querySelector('.mdoc-job__name')!.getBoundingClientRect();
        return d.left < n.left;
      });
    expect(leads).toBe(true);
    await expect(page.locator('.mdoc-step').first()).toBeHidden();

    await page.locator('.mdoc-job__sum').first().click();
    await expect(page.locator('.mdoc-step').first()).toBeVisible();
    // Opening one leaves every other row alone.
    expect(await openCount()).toBe(1);
  });

  test('derives the counts row from the registry', async ({ page }) => {
    const counts = page.locator('.mdoc-counts__link');
    await expect(counts).toHaveCount(3);
    await expect(counts.nth(0)).toHaveText('16 tools');
    await expect(counts.nth(1)).toHaveText('133 resources');
    await expect(counts.nth(2)).toHaveText('12 prompts');
  });

  test('lists every capability in the sidebar', async ({ page }) => {
    // 16 tools + 12 prompts + 3 resource families + 3 operations topics.
    await expect(page.locator('[data-cap-link]')).toHaveCount(34);
  });

  test('every note paragraph sits under a section heading', async ({ page }) => {
    // The Arguments heading is driven by `args || argNote`, because three tools
    // take none and carry only the note: rendered bare, that line hung off the
    // gloss and the section read as missing rather than empty. Asserted as a
    // structural property over all 34 panes — panes are server-rendered, so
    // they are all in the DOM here whether or not the cascade shows them.
    const { checked, orphans } = await page.evaluate(() => {
      const orphans: string[] = [];
      let checked = 0;
      document.querySelectorAll('[data-pane]').forEach((pane) => {
        const labels = [...pane.querySelectorAll('h3.mdoc-pane__label')];
        pane.querySelectorAll('.mdoc-pane__note').forEach((note) => {
          checked += 1;
          const labelled = labels.some(
            (label) =>
              (label.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
          );
          if (!labelled) orphans.push(pane.id);
        });
      });
      return { checked, orphans };
    });

    expect(orphans).toEqual([]);
    // Non-vacuous, and the count is the registry's: a note that stopped
    // rendering would otherwise pass this as an empty sweep.
    expect(checked).toBe(EXPECTED_NOTES);
  });
});

test.describe('MCP documentation — lens and contract selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForSelector('h1');
  });

  test('the lens switch swaps which lens renders', async ({ page }) => {
    await page.locator('[data-lens-link="reference"]').click();
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    await page.locator('[data-lens-link="jobs"]').click();
    await expect.poll(() => visibleLenses(page)).toEqual(['jobs']);
  });

  test('Reference opens on the default contract, one pane at a time', async ({ page }) => {
    await page.locator('[data-lens-link="reference"]').click();
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-search_regulations']);
  });

  test('a sidebar item swaps the rendered contract', async ({ page }) => {
    await page.locator('[data-lens-link="reference"]').click();
    await page.locator('[data-cap-link][data-cap-id="compute_techpar"]').click();
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-compute_techpar']);
    await expect(page.locator('#cap-compute_techpar h2').first()).toHaveText('compute_techpar');
  });

  test('a job step opens that capability in Reference', async ({ page }) => {
    await page.locator('.mdoc-job__sum').first().click();
    await page.locator('.mdoc-step').first().click();
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-gst_target_quick_look']);
  });

  test('a deep link lands on Reference and that contract directly', async ({ page }) => {
    // State assertion, not a paint-timing one: `domcontentloaded` is as early as
    // the state is meaningful, and asserting "no flash" would be flaky by shape.
    await page.goto(`${ROUTE}#cap-compute_techpar`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-compute_techpar']);
    await expect(page.locator('[data-cap-link][data-cap-id="compute_techpar"]')).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  test('a stale deep link falls back to the default contract', async ({ page }) => {
    // Reference must never render empty. The inline bootstrap cannot check
    // whether a pane exists (it runs before they parse), so the module does.
    await page.goto(`${ROUTE}#cap-no_such_capability`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-search_regulations']);
  });

  test('a related chip navigates to the capability it names', async ({ page }) => {
    await page.goto(`${ROUTE}#cap-compute_techpar`);
    await page.locator('#cap-compute_techpar a.brutal-filter-chip').first().click();
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-gst_target_quick_look']);
  });

  test('the counts row opens Reference scrolled to that group', async ({ page }) => {
    await page.locator('[data-group-jump="Prompts"]').click();
    await expect.poll(() => visibleLenses(page)).toEqual(['reference']);
    // The nav container scrolls, not the page: the sidebar is a side column and
    // scrollIntoView would drag the whole document.
    await expect
      .poll(() => page.locator('[data-cap-nav]').evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
  });

  test('the argument note is separated from the table it qualifies', async ({ page }) => {
    // Measured, not asserted as a class: the note sat directly under the last
    // row's 1px rule with only the cell's own bottom padding above it, so the
    // qualifier read as one more row rather than as prose about the table.
    await page.goto(`${ROUTE}#cap-compute_techpar`);
    const gap = await page.evaluate(() => {
      const pane = document.querySelector('#cap-compute_techpar');
      const table = pane?.querySelector('.mdoc-args');
      const note = pane?.querySelector('.mdoc-pane__note');
      if (!table || !note) return null;
      return note.getBoundingClientRect().top - table.getBoundingClientRect().bottom;
    });
    expect(gap).not.toBeNull();
    expect(gap).toBeGreaterThanOrEqual(12);
  });

  test('the Example copy button flips to Copied and restores its label', async ({ page }) => {
    // Addressed as `[data-copy-prev]`, not `[data-copy]`: the pane now carries
    // one `[data-copy]` per argument value, and a label swap is exactly what
    // those must NOT do. Here the label is chrome, so the swap is still right.
    // The button copies from the `[data-snippet]` beside it, and the delegation
    // bails when no snippet resolves — so feedback firing at all is also proof
    // that a non-empty snippet was found.
    await page.goto(`${ROUTE}#cap-compute_techpar`);
    const btn = page.locator('#cap-compute_techpar [data-copy-prev]');
    const original = (await btn.textContent())?.trim();
    await btn.click();
    await expect(btn).toHaveText('Copied');
    await expect(btn).toHaveText(original ?? 'Copy', { timeout: 5000 });
  });

  test('copying an argument value leaves the value where it is', async ({ page }) => {
    // THE assertion this feature turns on. The shared copy helper swaps its
    // target's `textContent`, which on a value cell would delete the literal,
    // the screen-reader name qualifier and both glyphs in one write — and its
    // restore would put back a single flat text node, so the damage outlives
    // the feedback window. Clipboard contents are deliberately never read
    // (TEST_BEST_PRACTICES 11 & 24); the observable state is the proof.
    await page.goto(`${ROUTE}#cap-compute_techpar`);
    const btn = page.locator('#cap-compute_techpar .mdoc-args__value').first();
    // The BUTTON's own text, not the inner span's. Under the regression the
    // span does not survive at all, and an element-not-found would report a
    // missing locator rather than naming the value that changed.
    const before = await btn.textContent();
    expect(before).toContain('18400000');

    await btn.click();
    // Presence, not value: `data-copy-original` lands on the button on both
    // paths, so this only waits for the feedback window to be open. The text
    // comparison below is what discriminates, and it is the assertion that
    // names the literal when it fails.
    await expect(btn).toHaveAttribute('data-copy-original', /^/);
    expect(await btn.textContent()).toBe(before);
    // Second, independent proof of the same thing: what the helper saved as
    // "the original" is the detached span's empty text, not the button's.
    await expect(btn).toHaveAttribute('data-copy-original', '');

    // Confirmed in the page-level live region, which is the only place it can
    // be: the button's name must not change, and a live region nested inside a
    // button is not reliably exposed.
    await expect(page.locator('[data-copy-status]')).toHaveText('Copied');

    // And it survives the reset, which is where a swapped-then-restored button
    // shows the damage: the restore writes back one flat text node.
    await expect(btn).not.toHaveAttribute('data-copy-original', '', { timeout: 5000 });
    expect(await btn.textContent()).toBe(before);
  });

  test('the example call carries no markup whitespace of its own', async ({ page }) => {
    // `white-space: pre-wrap` renders every space in the source, so a formatter
    // reflowing the `<pre>` tag onto its own lines indents the first line of the
    // call and adds a trailing blank one. It shipped that way once. `set:text`
    // is the fix; this asserts the rendered property rather than the technique,
    // so a future author is free to change how it gets there.
    await page.goto(`${ROUTE}#cap-generate_information_request_list_xlsx`);
    const text = await page
      .locator('#cap-generate_information_request_list_xlsx [data-snippet]')
      .textContent();
    expect(text).not.toBeNull();
    const lines = text!.split('\n');
    expect(lines[0]).toBe('generate_information_request_list_xlsx({');
    expect(lines[lines.length - 1]).toBe('})');
    // Body lines carry the call's own two-space indent and nothing more.
    for (const line of lines.slice(1, -1)) expect(line).toMatch(/^ {2}"/);
  });

  test('every argument value is a target of at least 24px on both axes', async ({ page }) => {
    // WCAG 2.2 AA 2.5.8. Measured rather than trusted to the axe sweep: several
    // literals are one or two characters, and a content-sized control can clear
    // the height floor while failing the width one.
    await page.goto(`${ROUTE}#cap-compute_techpar`);
    const boxes = await page.locator('#cap-compute_techpar .mdoc-args__value').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent?.trim().slice(-20) ?? '', w: r.width, h: r.height };
      })
    );
    expect(boxes).toHaveLength(14);
    expect(boxes.filter((b) => b.w < 24 || b.h < 24)).toEqual([]);
  });
});

test.describe('MCP documentation — capability search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForSelector('h1');
  });

  test('the field appears only once its script has run', async ({ page }) => {
    // Rendered `hidden` so a reader without JS never meets a dead input; the
    // module unhides it. Computed style, not the attribute alone.
    await expect
      .poll(() => page.locator('[data-cap-search]').evaluate((el) => getComputedStyle(el).display))
      .not.toBe('none');
  });

  test('matches on identifier and on description', async ({ page }) => {
    const input = page.locator('[data-cap-search-input]');
    await input.fill('techpar');
    await expect(page.locator('[data-cap-search-results] [role="option"]')).toHaveCount(1);

    await input.fill('carrying cost');
    const byGloss = page.locator('[data-cap-search-results] [role="option"]');
    await expect(byGloss.first()).toContainText('estimate_tech_debt_cost');
  });

  test('reports an empty result rather than an empty box', async ({ page }) => {
    await page.locator('[data-cap-search-input]').fill('zzzznotacapability');
    await expect(page.locator('.brutal-search__no-results')).toContainText('No capability matches');
  });

  test('keyboard selection opens the contract', async ({ page }) => {
    const input = page.locator('[data-cap-search-input]');
    await input.fill('techpar');
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', 'mdoc-search-option-0');
    await input.press('Enter');
    await expect.poll(() => visiblePaneIds(page)).toEqual(['cap-compute_techpar']);
    await expect(input).toHaveValue('');
  });

  test('Escape closes the dropdown', async ({ page }) => {
    const input = page.locator('[data-cap-search-input]');
    await input.fill('techpar');
    await expect(page.locator('[data-cap-search-results]')).toBeVisible();
    await input.press('Escape');
    await expect(page.locator('[data-cap-search-results]')).toBeHidden();
  });
});

test.describe('MCP documentation — without JavaScript', () => {
  test('renders every contract as one linear document', async ({ browser }) => {
    // This is where "the page publishes every capability" is enforced: the
    // parity suite imports the registry, and this proves the page renders it.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ROUTE);

    await expect(page.locator('[data-pane]')).toHaveCount(34);
    expect(await visiblePaneIds(page)).toHaveLength(34);
    // Both lenses read too: with no script there is nothing to switch with.
    await expect.poll(() => visibleLenses(page)).toEqual(['jobs', 'reference']);
    // And the dead search field is not offered.
    await expect(page.locator('[data-cap-search]')).toBeHidden();

    await context.close();
  });
});

test.describe('MCP documentation — themes and viewports', () => {
  test('renders in dark theme', async ({ page }) => {
    await page.goto(ROUTE);
    await page.evaluate(() => document.documentElement.classList.add('dark-theme'));
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.mdoc-job').first()).toBeVisible();
  });

  // 1305 and 1012 are not round numbers: they are the two bands where an
  // earlier, too-small track floor left the longest identifier ~1px over its
  // own track while every round width sampled clean. An auto-fit track equals
  // its floor exactly at each column-add threshold, so those thresholds are
  // where this can break — sample them, not just the design widths.
  for (const width of [1440, 1305, 1280, 1024, 1012, 900, 768, 480]) {
    test(`no capability identifier wraps at ${width}px`, async ({ page }) => {
      // A wrapped wire identifier reads as two entries: two sidebar rows, or two
      // job steps. The sidebar column is `max-content` sized and the step
      // grid drops columns rather than squeezing, so this holds down to 480 —
      // and NOT below it. Under 768px the longest identifier is wider than the
      // whole viewport, and the component deliberately wraps it there rather
      // than scrolling (which axe rates a serious violation) or shrinking it;
      // see JobCard.astro's media block. The widths below are all ≥480 for
      // that reason. The assertion is what keeps a future longer tool name
      // honest at the widths where one line is still possible.
      // Line count comes from a Range over the text, since the elements are
      // block-level and would report one rect however they wrap.
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ROUTE);
      await page.waitForSelector('h1');
      // Job steps live inside closed disclosures now, and a closed one lays out
      // nothing — every id would report zero rects and this guard would sweep an
      // empty set at full strength. Open them all, then assert the probe count.
      await page.evaluate(() =>
        document
          .querySelectorAll('details.mdoc-job')
          .forEach((d) => ((d as HTMLDetailsElement).open = true))
      );
      const { wrapped, probed } = await page.evaluate(() => {
        const out: string[] = [];
        const els = document.querySelectorAll('.mdoc-step__id, [data-cap-link]');
        els.forEach((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const clipped = el.scrollWidth > el.clientWidth + 1;
          if (range.getClientRects().length > 1 || clipped) out.push(el.textContent?.trim() ?? '');
        });
        return { wrapped: out, probed: els.length };
      });
      // 30 job-step ids + 34 sidebar entries. Asserted so a selector that stops
      // matching fails here rather than passing over nothing.
      expect(probed).toBe(64);
      expect(wrapped).toEqual([]);
    });
  }

  // The index shipped with a four-column summary (caret / 340px name / artifact /
  // count) and four fixed step tracks, which is ~700px of content: at 390px the
  // summary row overflowed itself by 315px, the wire ids by 229px, and the page
  // by 267px, so the whole document scrolled sideways. A horizontally
  // scrolling page is the worst failure mode a phone reader can get, and no
  // existing test would have caught it, so this asserts the property directly
  // rather than the media queries that deliver it.
  for (const width of [390, 480, 768]) {
    test(`the jobs index does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ROUTE);
      await page.waitForSelector('h1');
      // Worst case is every row open: closed rows lay out none of their steps.
      await page.evaluate(() =>
        document
          .querySelectorAll('details.mdoc-job')
          .forEach((d) => ((d as HTMLDetailsElement).open = true))
      );
      const { pageOverflow, offenders, probed } = await page.evaluate(() => {
        const offenders: string[] = [];
        const sel = '.mdoc-job__sum, .mdoc-job__steps, .mdoc-job__body, .mdoc-step__id';
        const els = document.querySelectorAll(sel);
        els.forEach((el) => {
          const over = Math.round(el.scrollWidth - el.clientWidth);
          if (over > 1) offenders.push(`${el.className}: +${over}px`);
        });
        return {
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          offenders,
          probed: els.length,
        };
      });
      expect(probed).toBeGreaterThan(0);
      expect(offenders).toEqual([]);
      expect(pageOverflow).toBeLessThanOrEqual(0);
    });
  }

  // The title column is a FIXED 430px above 900px, so a title longer than it
  // does not shrink the column — it wraps, and one 69px row among a column of
  // 47px ones is the raggedness an index exists to avoid. This has happened
  // twice, both times on a rename: `Shape a technology diligence before the LOI`
  // (362px) wrapped at the old 340px, and `Populate a request list from
  // available information` (420px) wrapped at 380px. The guard is on the
  // property a reader sees, not on the column value, so widening the column or
  // re-cutting the title both satisfy it.
  for (const width of [1440, 1280, 1024]) {
    test(`no job title wraps at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ROUTE);
      await page.waitForSelector('h1');
      const { wrapped, probed } = await page.evaluate(() => {
        const els = [...document.querySelectorAll('.mdoc-job__name')];
        const wrapped = els
          .filter((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getClientRects().length > 1;
          })
          .map((el) => el.textContent ?? '');
        return { wrapped, probed: els.length };
      });
      expect(probed).toBe(12);
      expect(wrapped).toEqual([]);
    });
  }

  // 44px is the WCAG 2.5.5 floor and the summary is the only control on the
  // lens, so it is the one that has to clear it at every width.
  for (const width of [1440, 768, 390]) {
    test(`each job row is a ${width}px-wide touch target of at least 44px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ROUTE);
      await page.waitForSelector('h1');
      const heights = await page
        .locator('.mdoc-job__sum')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(heights).toHaveLength(12);
      expect(heights.filter((h) => h < 44)).toEqual([]);
    });
  }

  for (const width of [640, 480]) {
    test(`stacked at ${width}px, the column heads stay in the accessibility tree`, async ({
      page,
    }) => {
      // The header row is CLIPPED rather than `display: none`. It is where every
      // value cell's column association comes from, and a stacked table is
      // exactly where that association matters most — so removing it from the
      // tree would strip the benefit that justified adding a `<thead>` at all.
      // The visible column name comes back as an `aria-hidden` span in the cell,
      // which is why it can be shown without announcing the name twice.
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${ROUTE}#cap-compute_techpar`);
      const head = page.locator('#cap-compute_techpar .mdoc-args__head');
      const state = await head.evaluate((el) => {
        const s = getComputedStyle(el);
        return { display: s.display, position: s.position, w: el.getBoundingClientRect().width };
      });
      expect(state.display).not.toBe('none');
      expect(state.position).toBe('absolute');
      expect(state.w).toBeLessThan(4);

      await expect(page.locator('#cap-compute_techpar .mdoc-args__col').first()).toBeVisible();
    });
  }

  for (const width of [768, 480]) {
    test(`renders at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${ROUTE}#cap-compute_techpar`);
      await expect(page.locator('#cap-compute_techpar')).toBeVisible();
      // No horizontal overflow: long identifiers break mid-token instead.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(overflow).toBe(false);
    });
  }
});
