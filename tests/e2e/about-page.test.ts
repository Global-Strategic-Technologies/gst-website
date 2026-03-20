/**
 * About Page E2E Tests
 * Tests for founder section including photo interactions, theme switching, and analytics
 */

import { test, expect } from '@playwright/test';

/**
 * Click the theme toggle via dispatchEvent to bypass WebKit hit-test issues.
 */
async function clickThemeToggle(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('themeToggle')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
  });
}

/**
 * Click the founder photo link via dispatchEvent to bypass WebKit hit-test issues.
 */
async function clickFounderPhotoLink(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('founder-photo-link')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
  });
}

test.describe('About Page - Founder Section', () => {
  // Helper function to setup gtag wrapping for analytics verification
  async function setupAnalyticsMocking(page: any) {
    await page.evaluate(() => {
      // Initialize event tracking arrays
      (window as any).gtagEvents = [];
      (window as any).gtagCalls = [];

      // Store the original gtag function
      const originalGtag = (window as any).gtag;

      // Create wrapped gtag function
      (window as any).gtag = function(...args: any[]) {
        // Record all gtag calls
        (window as any).gtagCalls.push({
          timestamp: new Date().toISOString(),
          args: JSON.parse(JSON.stringify(args)),
        });

        // Record event calls specifically
        if (args[0] === 'event') {
          (window as any).gtagEvents.push({
            eventName: args[1],
            eventData: args[2] || {},
            timestamp: new Date().toISOString(),
          });
        }

        // Call original gtag
        if (typeof originalGtag === 'function') {
          return originalGtag.apply(this, args);
        }
      };
    });
  }

  test.beforeEach(async ({ page }) => {
    // Block external GA requests
    await page.route('**/googletagmanager.com/**', route => {
      route.abort();
    });
    await page.route('**/google-analytics.com/**', route => {
      route.abort();
    });

    // Navigate to about page
    await page.goto('/about', { waitUntil: 'domcontentloaded' });

    // Wait for gtag to be available
    await page.waitForFunction(() => {
      return typeof window.gtag === 'function';
    }, { timeout: 10000 });

    // Setup mocking for analytics verification
    await setupAnalyticsMocking(page);
  });

  test.describe('Founder Photo Display', () => {
    test('should display founder photo in landscape layout', async ({ page }) => {
      const img = page.locator('.founder-image').first();

      // Wait for image to load and be visible
      await expect(img).toBeVisible();

      // Get actual rendered dimensions
      const box = await img.boundingBox();
      expect(box).toBeTruthy();

      if (box) {
        // Verify image has reasonable dimensions
        expect(box.width).toBeGreaterThan(100);
        expect(box.height).toBeGreaterThan(50);

        // For founder photo, verify it's not distorted
        // The aspect ratio should be reasonable (width >= height is fine)
        expect(box.width).toBeGreaterThanOrEqual(box.height * 0.8);
      }
    });

    test('should render founder photo as clickable link to LinkedIn', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');
      await expect(founderLink).toBeVisible();

      const href = await founderLink.getAttribute('href');
      expect(href).toBe('https://www.linkedin.com/in/reidperyam/');

      // Should open in new window
      const target = await founderLink.getAttribute('target');
      expect(target).toBe('_blank');

      // Should have noopener noreferrer for security
      const rel = await founderLink.getAttribute('rel');
      expect(rel).toBe('noopener noreferrer');
    });
  });

  test.describe('Founder Photo Theme Variants', () => {
    test('should show light theme photo by default', async ({ page }) => {
      // Ensure light theme is active

      const isDarkMode = await page.evaluate(() => document.documentElement.classList.contains('dark-theme'));

      if (isDarkMode) {
        // Toggle to light theme
        await clickThemeToggle(page);
        await page.waitForTimeout(100);
      }

      // Verify light photo is displayed
      const lightPhoto = page.locator('.founder-portrait-light');
      await expect(lightPhoto).toBeVisible();

      const darkPhoto = page.locator('.founder-portrait-dark');
      await expect(darkPhoto).not.toBeVisible();
    });

    test('should switch to dark theme photo when dark mode is enabled', async ({ page }) => {


      // Get initial theme
      const initialIsDark = await page.evaluate(() => document.documentElement.classList.contains('dark-theme'));

      // Toggle to dark mode if not already there
      if (!initialIsDark) {
        await clickThemeToggle(page);
        await page.waitForTimeout(100);
      }

      // Verify dark photo is displayed
      const darkPhoto = page.locator('.founder-portrait-dark');
      await expect(darkPhoto).toBeVisible();

      const lightPhoto = page.locator('.founder-portrait-light');
      await expect(lightPhoto).not.toBeVisible();
    });

    test('should switch photos when toggling between light and dark themes', async ({ page }) => {
      // Toggle theme 3 times and verify correct photo displays each time
      for (let i = 0; i < 3; i++) {
        await clickThemeToggle(page);
        await page.waitForTimeout(150);

        // Check which theme is active
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark-theme'));

        if (isDark) {
          const darkPhoto = page.locator('.founder-portrait-dark');
          await expect(darkPhoto).toBeVisible();
        } else {
          const lightPhoto = page.locator('.founder-portrait-light');
          await expect(lightPhoto).toBeVisible();
        }
      }
    });
  });

  test.describe('Founder Signature Display', () => {
    test('should display founder signature in bio section', async ({ page }) => {
      const signature = page.locator('.founder-signature');
      const count = await signature.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should show light signature by default', async ({ page }) => {
      // Ensure light theme

      const isDarkMode = await page.evaluate(() => document.documentElement.classList.contains('dark-theme'));

      if (isDarkMode) {
        await clickThemeToggle(page);
        await page.waitForTimeout(100);
      }

      // Verify light signature container exists
      const lightSig = page.locator('.founder-signature-light');
      const lightCount = await lightSig.count();
      expect(lightCount).toBeGreaterThan(0);
    });

    test('should switch to dark signature in dark theme', async ({ page }) => {


      // Ensure dark theme
      const initialIsDark = await page.evaluate(() => document.documentElement.classList.contains('dark-theme'));
      if (!initialIsDark) {
        await clickThemeToggle(page);
        await page.waitForTimeout(100);
      }

      // Verify dark signature is visible
      const darkSig = page.locator('.founder-signature-dark');
      await expect(darkSig).toBeVisible();

      const lightSig = page.locator('.founder-signature-light');
      await expect(lightSig).not.toBeVisible();
    });

    test('should maintain signature aspect ratio across themes', async ({ page }) => {
      // Get signature containers
      const sigContainers = page.locator('.founder-signature');
      const count = await sigContainers.count();

      if (count > 0) {
        // Get initial visible signature and its dimensions
        const visibleSig = page.locator('.founder-signature-light:visible, .founder-signature-dark:visible').first();
        await expect(visibleSig).toBeVisible();

        const initialBox = await visibleSig.boundingBox();
        expect(initialBox).toBeTruthy();

        if (initialBox) {
          const initialWidth = initialBox.width;
          const initialHeight = initialBox.height;
          const initialRatio = initialWidth / initialHeight;

          // Toggle theme
          await clickThemeToggle(page);
          await page.waitForTimeout(150);

          // Get new visible signature and its dimensions
          const newVisibleSig = page.locator('.founder-signature-light:visible, .founder-signature-dark:visible').first();
          await expect(newVisibleSig).toBeVisible();

          const newBox = await newVisibleSig.boundingBox();
          expect(newBox).toBeTruthy();

          if (newBox) {
            const newWidth = newBox.width;
            const newHeight = newBox.height;
            const newRatio = newWidth / newHeight;

            // Aspect ratio should be maintained (allow 10% tolerance)
            expect(Math.abs(newRatio - initialRatio)).toBeLessThan(initialRatio * 0.1);
          }
        }
      }
    });
  });

  test.describe('Founder Photo GA Tracking', () => {
    test('should track founder_profile_click event when photo is clicked', async ({ page }) => {
      // Click founder photo
      const founderLink = page.locator('#founder-photo-link');
      await expect(founderLink).toBeVisible();

      // Prevent navigation to LinkedIn
      await page.evaluate(() => {
        const link = document.getElementById('founder-photo-link') as HTMLAnchorElement;
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
          });
        }
      });

      // Use dispatchEvent to bypass WebKit hit-test issues
      await clickFounderPhotoLink(page);

      // Verify founder_profile_click event was tracked
      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const founderClickEvent = events.find(
        (e: any) => e.eventName === 'founder_profile_click'
      );

      expect(founderClickEvent).toBeDefined();
      expect(founderClickEvent?.eventData.destination).toBe(
        'https://www.linkedin.com/in/reidperyam/'
      );
      expect(founderClickEvent?.eventData.event_category).toBe('engagement');
    });

    test('should include correct destination in analytics event', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');

      // Prevent navigation
      await page.evaluate(() => {
        const link = document.getElementById('founder-photo-link') as HTMLAnchorElement;
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
          });
        }
      });

      // Use dispatchEvent to bypass WebKit hit-test issues
      await clickFounderPhotoLink(page);

      // Verify event data
      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const event = events.find((e: any) => e.eventName === 'founder_profile_click');

      expect(event?.eventData.destination).toBe('https://www.linkedin.com/in/reidperyam/');
    });

    test('should categorize founder click as engagement event', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');

      // Prevent navigation
      await page.evaluate(() => {
        const link = document.getElementById('founder-photo-link') as HTMLAnchorElement;
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
          });
        }
      });

      // Use dispatchEvent to bypass WebKit hit-test issues
      await clickFounderPhotoLink(page);

      // Verify event category
      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const event = events.find((e: any) => e.eventName === 'founder_profile_click');

      expect(event?.eventData.event_category).toBe('engagement');
    });

    test('should track multiple clicks on founder photo', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');

      // Prevent navigation
      await page.evaluate(() => {
        const link = document.getElementById('founder-photo-link') as HTMLAnchorElement;
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
          });
        }
      });

      // Click multiple times via dispatchEvent to bypass WebKit hit-test issues
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          document.getElementById('founder-photo-link')?.dispatchEvent(
            new MouseEvent('click', { bubbles: true })
          );
        });
        // Wait for each event to be recorded before the next click
        await page.waitForFunction((expected) => {
          const events = (window as any).gtagEvents || [];
          return events.filter((e: any) => e.eventName === 'founder_profile_click').length >= expected;
        }, i + 1, { timeout: 5000 });
      }

      // Verify all clicks were tracked
      const events = await page.evaluate(() => (window as any).gtagEvents || []);
      const founderClicks = events.filter(
        (e: any) => e.eventName === 'founder_profile_click'
      );

      expect(founderClicks.length).toBe(3);
    });
  });

  test.describe('Founder Photo Interaction States', () => {
    test('should have hover effect on founder photo', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');
      await expect(founderLink).toBeVisible();

      // Verify that the CSS :hover rule exists with opacity < 1
      // (Cannot reliably trigger :hover in headless browsers via JS events)
      const hasHoverRule = await page.evaluate(() => {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              const cssRule = rule as CSSStyleRule;
              if (cssRule.selectorText?.includes('founder-photo-link') &&
                  cssRule.selectorText?.includes(':hover') &&
                  cssRule.style?.opacity) {
                return parseFloat(cssRule.style.opacity) < 1;
              }
            }
          } catch { /* cross-origin sheets */ }
        }
        return false;
      });
      expect(hasHoverRule).toBe(true);
    });

    test('should have cursor:pointer on founder photo link', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');
      const cursor = await founderLink.evaluate(el => {
        return window.getComputedStyle(el).cursor;
      });

      expect(cursor).toBe('pointer');
    });

    test('should not have text decoration on founder photo link', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');
      const textDecoration = await founderLink.evaluate(el => {
        return window.getComputedStyle(el).textDecoration;
      });

      // text-decoration-line should be none or text-decoration should be none
      expect(textDecoration).toContain('none');
    });
  });

  test.describe('About Page Layout', () => {
    test('should display founder section with content', async ({ page }) => {
      const founderSection = page.locator('.founder-section');
      await expect(founderSection).toBeVisible();

      // Verify bio content is visible
      const bioTitle = page.locator('.founder-bio h2');
      await expect(bioTitle).toHaveText('About the Founder');

      const bioText = page.locator('.founder-bio p').first();
      await expect(bioText).toBeVisible();
    });

    test('should display credentials in italic', async ({ page }) => {
      const credentials = page.locator('.founder-credentials');
      await expect(credentials).toBeVisible();

      const fontStyle = await credentials.evaluate(el => {
        return window.getComputedStyle(el).fontStyle;
      });

      expect(fontStyle).toBe('italic');
    });

    test('should position founder photo and bio side by side', async ({ page }) => {
      const founderContent = page.locator('.founder-content');
      const displayValue = await founderContent.evaluate(el => {
        return window.getComputedStyle(el).display;
      });

      // Should use grid layout
      expect(displayValue).toBe('grid');
    });

    test('should be responsive on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/about');

      const founderSection = page.locator('.founder-section');
      await expect(founderSection).toBeVisible();

      const founderContent = page.locator('.founder-content');
      const displayValue = await founderContent.evaluate(el => {
        return window.getComputedStyle(el).display;
      });

      expect(displayValue).toBe('grid');
    });
  });

  test.describe('Cross-Browser Compatibility', () => {
    test('should display correctly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/about', { waitUntil: 'domcontentloaded' });

      const founderPhoto = page.locator('.founder-portrait').first();
      await expect(founderPhoto).toBeVisible();

      // Verify about page is still accessible on mobile
      const founderSection = page.locator('.founder-section');
      await expect(founderSection).toBeVisible();
    });

    test('should display correctly on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/about');

      const founderPhoto = page.locator('.founder-portrait-light, .founder-portrait-dark');
      await expect(founderPhoto.first()).toBeVisible();

      const signature = page.locator('.founder-signature-light, .founder-signature-dark');
      await expect(signature.first()).toBeVisible();
    });

    test('should display correctly on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/about');

      const founderPhoto = page.locator('.founder-portrait-light, .founder-portrait-dark');
      await expect(founderPhoto.first()).toBeVisible();

      const signature = page.locator('.founder-signature-light, .founder-signature-dark');
      await expect(signature.first()).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('founder photo link should have proper alt text', async ({ page }) => {
      const img = page.locator('.founder-image').first();
      const altText = await img.getAttribute('alt');

      expect(altText).toBeTruthy();
      expect(altText).toContain('Founder');
    });

    test('founder photo link should be keyboard accessible', async ({ page }) => {
      const founderLink = page.locator('#founder-photo-link');

      // Tab to the link
      await founderLink.focus();

      const isFocused = await founderLink.evaluate(el => el === document.activeElement);
      expect(isFocused).toBe(true);
    });

    test('signature images should have alt text', async ({ page }) => {
      const sig = page.locator('.signature-image').first();
      const altText = await sig.getAttribute('alt');

      expect(altText).toBeTruthy();
      expect(altText).toContain('signature');
    });
  });
});
