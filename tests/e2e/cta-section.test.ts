/**
 * The consultation CTA's email line, on every page that renders one.
 *
 * `CTABox.astro` is one component behind four public pages, so a defect in its
 * markup ships four times. One did: the em dash sat at the end of its own
 * source line with the `<a>` beginning the next, and Astro drops a whitespace
 * run that contains a newline — so the address rendered hard against the dash,
 * `Or reach out directly —contact@globalstrategic.tech`, on `/`, `/about/`,
 * `/services/` and `/hub/`. The fix is an explicit `{' '}` expression, because
 * Prettier owns the line breaks in that block and would fold a literal space
 * back onto a newline and silently reintroduce it.
 *
 * That fix was guarded only by a source comment, in the exact block whose
 * formatting is not the author's to control. This asserts the rendered
 * OUTCOME instead, which is the only thing a formatter cannot quietly undo.
 *
 * Copy-agnostic on purpose: the assertion is that a separator and the address
 * are not fused, not what the sentence says. Rewording the line must not turn
 * a required check red.
 */
import { test, expect } from '@playwright/test';

/** Every route whose page passes an `emailAddress` to CTABox. */
const ROUTES = ['/', '/about/', '/services/', '/hub/'] as const;

test.describe('Consultation CTA email line', () => {
  for (const route of ROUTES) {
    test(`${route} separates the em dash from the address`, async ({ page }) => {
      await page.goto(route);

      const line = page.locator('.cta-email');
      await expect(line, `${route} renders the CTA email line`).toHaveCount(1);

      // Whitespace is normalised by toHaveText, which collapses runs but
      // cannot invent one — so a missing space still fails here.
      await expect(line, 'the dash and the address are not fused').toHaveText(/—\s\S+@\S+/);

      // …and the address is the thing that is linked, not the whole sentence.
      const mail = line.locator('a[href^="mailto:"]');
      await expect(mail).toHaveCount(1);
    });
  }
});
