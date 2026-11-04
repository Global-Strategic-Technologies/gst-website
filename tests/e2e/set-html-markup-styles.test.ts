/**
 * Markup that reaches a page through `set:html` or a script's `innerHTML`
 * carries no Astro scope attribute, so a plain scoped selector such as
 * `.box strong` silently misses it and the element falls back to the global
 * rule. These pages reach it with `:global()`; each case fails if that is lost.
 * Expected values are resolved from the token in the page, because the palette
 * rotates daily.
 */
import { test, expect, type Page } from '@playwright/test';

/** An element's computed colour beside the same page's value for `token`. */
async function colorAgainst(page: Page, selector: string, token: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((el, name) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      document.body.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return { actual: getComputedStyle(el).color, expected };
    }, token);
}

test('ICG: the cost context emphasis takes the primary text colour', async ({ page }) => {
  await page.goto('/hub/tools/infrastructure-cost-governance/', { waitUntil: 'load' });
  const { actual, expected } = await colorAgainst(
    page,
    '.icg-cost-context strong',
    '--text-primary'
  );
  expect(actual).toBe(expected);
});

test('MCP page: code in the access facts takes the brand colour', async ({ page }) => {
  await page.goto('/hub/mcp/', { waitUntil: 'load' });
  const { actual, expected } = await colorAgainst(page, '.mcp-facts code', '--color-primary');
  expect(actual).toBe(expected);
});

test('TechPar: the script-built cross-link takes the brand colour', async ({ page }) => {
  await page.goto('/hub/tools/techpar/', { waitUntil: 'load' });
  // Written the way chart.ts writes it, without driving a whole calculation to
  // an elevated R&D zone: the property under test is the selector reaching an
  // anchor that has no scope attribute.
  await page
    .locator('[data-cross-link]')
    .evaluate((box) => (box.innerHTML = '<a href="/hub/tools/tech-debt-calculator/">link</a>'));
  const { actual, expected } = await colorAgainst(page, '.tp-cross-link a', '--color-primary');
  expect(actual).toBe(expected);
});

// Not a scoping case, and here for the same symptom: `:global()` in a plain .css
// file reached the browser as an unknown pseudo-class, which drops the rule.
test('FAQ answers: paragraphs are spaced and the last one sits flush', async ({ page }) => {
  await page.goto('/services/', { waitUntil: 'load' });
  const margins = await page
    .locator('.brutal-faq__answer')
    .first()
    .evaluate((box) => {
      box.innerHTML = '<p>one</p><p>two</p>';
      const [first, last] = [...box.querySelectorAll('p')].map(
        (el) => getComputedStyle(el).marginBottom
      );
      return { first, last };
    });
  expect(parseFloat(margins.first)).toBeGreaterThan(0);
  expect(margins.last).toBe('0px');
});

// By decision (2026-11-03): FAQ links follow the site-wide link rule in
// global.css, ink at rest and brand teal on hover, with no underline of their own.
for (const path of ['/services/', '/hub/', '/hub/tools/regulatory-map/']) {
  test(`FAQ answers on ${path}: a link keeps the site's link colour`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'load' });
    const { actual, expected } = await colorAgainst(
      page,
      '.brutal-faq__answer a',
      '--color-secondary-ink'
    );
    expect(actual).toBe(expected);
  });
}
