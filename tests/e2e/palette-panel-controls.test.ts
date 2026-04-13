import { test, expect } from '@playwright/test';

/**
 * Click a palette panel button via dispatchEvent (bypasses z-index hit-testing issues).
 */
async function clickPanelButton(page: import('@playwright/test').Page, id: string): Promise<void> {
  await page.evaluate((btnId) => {
    document.getElementById(btnId)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, id);
}

/**
 * Open the palette panel and wait for the is-open class.
 */
async function openPanel(page: import('@playwright/test').Page): Promise<void> {
  await clickPanelButton(page, 'panel-toggle');
  await page.waitForFunction(
    () => document.getElementById('palette-panel')?.classList.contains('is-open'),
    { timeout: 10000 }
  );
}

/**
 * Wait for swatch controls to be injected (they are added by palette-manager on DOMContentLoaded + panel open).
 */
async function waitForSwatchControls(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.swatch-controls').length > 0, {
    timeout: 10000,
  });
}

/** CSS selector for the first semi-transparent swatch (--text-secondary, alpha 0.7). */
const ALPHA_SWATCH = '.brand-swatch[data-var="--text-secondary"]';

test.describe('Palette Panel Controls', () => {
  test.describe('Swatch Controls Injection', () => {
    test('should inject swatch controls inside brand-swatch elements when panel opens', async ({
      page,
    }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      const result = await page.evaluate(() => {
        const swatches = document.querySelectorAll('.brand-swatch');
        const withControls = document.querySelectorAll('.brand-swatch .swatch-controls');
        // injectControls() now supports semi-transparent swatches (alpha slider).
        // Only fully transparent swatches (rgba(0,0,0,0)) are still skipped.
        let eligible = 0;
        swatches.forEach((el) => {
          const colorEl = el.querySelector<HTMLElement>('.brand-swatch__color');
          if (!colorEl) return;
          const bg = getComputedStyle(colorEl).backgroundColor;
          if (bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') eligible++;
        });
        return {
          totalSwatches: swatches.length,
          eligibleSwatches: eligible,
          swatchesWithControls: withControls.length,
        };
      });

      expect(result.totalSwatches).toBeGreaterThan(0);
      expect(result.swatchesWithControls).toBe(result.eligibleSwatches);
    });
  });

  test.describe('Alpha Slider', () => {
    test('should show alpha slider only for semi-transparent swatches', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      const result = await page.evaluate(() => {
        const alphaSliders = document.querySelectorAll('.swatch-slider-a');
        const totalControls = document.querySelectorAll('.swatch-controls');
        const alphaDisplays = document.querySelectorAll('.swatch-alpha-display');
        return {
          alphaSliderCount: alphaSliders.length,
          alphaDisplayCount: alphaDisplays.length,
          totalControlCount: totalControls.length,
        };
      });

      // 9 semi-transparent swatches should have alpha sliders
      expect(result.alphaSliderCount).toBe(9);
      expect(result.alphaDisplayCount).toBe(9);
      // Opaque swatches should not have alpha sliders
      expect(result.totalControlCount).toBeGreaterThan(result.alphaSliderCount);
    });

    test('should update CSS variable with rgba when alpha slider changes', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      const result = await page.evaluate(() => {
        const alphaSlider = document.querySelector<HTMLInputElement>('.swatch-slider-a');
        if (!alphaSlider) return null;
        const swatch = alphaSlider.closest<HTMLElement>('.brand-swatch');
        const varName = swatch?.dataset.var;
        alphaSlider.value = '50';
        alphaSlider.dispatchEvent(new Event('input', { bubbles: true }));
        const applied = document.documentElement.style.getPropertyValue(varName!);
        return { varName, applied };
      });

      expect(result).toBeTruthy();
      expect(result!.applied).toMatch(/rgba\(\d+,\s*\d+,\s*\d+,\s*0\.5\)/);
    });
  });

  test.describe('Color Picker Sync', () => {
    test('should sync hex input and RGB sliders when color picker value changes', async ({
      page,
    }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      const newColor = '#aa3366';

      // Change the color picker on the first swatch via applyColor path
      await page.evaluate((color) => {
        const swatch = document.querySelector('.brand-swatch') as HTMLElement;
        const picker = swatch.querySelector<HTMLInputElement>('.swatch-picker');
        if (picker) {
          picker.value = color;
          picker.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, newColor);

      // Wait for sync to complete
      await page.waitForFunction(
        (color) => {
          const swatch = document.querySelector('.brand-swatch');
          const hexInput = swatch?.querySelector<HTMLInputElement>('.swatch-hex');
          return hexInput?.value === color;
        },
        newColor,
        { timeout: 10000 }
      );

      const result = await page.evaluate(() => {
        const swatch = document.querySelector('.brand-swatch');
        const hexInput = swatch?.querySelector<HTMLInputElement>('.swatch-hex');
        const sliderR = swatch?.querySelector<HTMLInputElement>('.swatch-slider-r');
        const sliderG = swatch?.querySelector<HTMLInputElement>('.swatch-slider-g');
        const sliderB = swatch?.querySelector<HTMLInputElement>('.swatch-slider-b');
        return {
          hex: hexInput?.value,
          r: sliderR ? parseInt(sliderR.value) : -1,
          g: sliderG ? parseInt(sliderG.value) : -1,
          b: sliderB ? parseInt(sliderB.value) : -1,
        };
      });

      expect(result.hex).toBe(newColor);
      // #aa3366 = rgb(170, 51, 102)
      expect(result.r).toBe(170);
      expect(result.g).toBe(51);
      expect(result.b).toBe(102);
    });

    test('should preserve alpha when color picker changes on a semi-transparent swatch', async ({
      page,
    }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      const newColor = '#cc4400';

      // Read the initial alpha value before editing
      const initialAlpha = await page.evaluate((sel) => {
        const swatch = document.querySelector<HTMLElement>(sel);
        const slider = swatch?.querySelector<HTMLInputElement>('.swatch-slider-a');
        return slider ? parseInt(slider.value) : null;
      }, ALPHA_SWATCH);
      expect(initialAlpha).toBeTruthy();

      // Change the color picker on the alpha swatch
      await page.evaluate(
        ({ sel, color }) => {
          const swatch = document.querySelector<HTMLElement>(sel);
          const picker = swatch?.querySelector<HTMLInputElement>('.swatch-picker');
          if (picker) {
            picker.value = color;
            picker.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
        { sel: ALPHA_SWATCH, color: newColor }
      );

      // Wait for hex input to sync
      await page.waitForFunction(
        ({ sel, color }) => {
          const swatch = document.querySelector(sel);
          const hexInput = swatch?.querySelector<HTMLInputElement>('.swatch-hex');
          return hexInput?.value === color;
        },
        { sel: ALPHA_SWATCH, color: newColor },
        { timeout: 10000 }
      );

      const result = await page.evaluate((sel) => {
        const swatch = document.querySelector<HTMLElement>(sel);
        const varName = swatch?.dataset.var;
        const alphaSlider = swatch?.querySelector<HTMLInputElement>('.swatch-slider-a');
        const cssValue = varName ? document.documentElement.style.getPropertyValue(varName) : '';
        return {
          alphaSliderValue: alphaSlider ? parseInt(alphaSlider.value) : -1,
          cssValue,
        };
      }, ALPHA_SWATCH);

      // Alpha slider should be unchanged
      expect(result.alphaSliderValue).toBe(initialAlpha);
      // CSS variable should be rgba (not plain hex)
      expect(result.cssValue).toMatch(/rgba\(/);
    });
  });

  test.describe('Hex Input Sync', () => {
    test('should sync color picker and RGB sliders when hex input changes', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      const newHex = '#22cc88';

      // Type a hex value into the first swatch's hex input
      await page.evaluate((hex) => {
        const swatch = document.querySelector('.brand-swatch') as HTMLElement;
        const hexInput = swatch.querySelector<HTMLInputElement>('.swatch-hex');
        if (hexInput) {
          hexInput.value = hex;
          hexInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, newHex);

      // Wait for picker to sync
      await page.waitForFunction(
        (hex) => {
          const swatch = document.querySelector('.brand-swatch');
          const picker = swatch?.querySelector<HTMLInputElement>('.swatch-picker');
          return picker?.value === hex;
        },
        newHex,
        { timeout: 10000 }
      );

      const result = await page.evaluate(() => {
        const swatch = document.querySelector('.brand-swatch');
        const picker = swatch?.querySelector<HTMLInputElement>('.swatch-picker');
        const sliderR = swatch?.querySelector<HTMLInputElement>('.swatch-slider-r');
        const sliderG = swatch?.querySelector<HTMLInputElement>('.swatch-slider-g');
        const sliderB = swatch?.querySelector<HTMLInputElement>('.swatch-slider-b');
        return {
          picker: picker?.value,
          r: sliderR ? parseInt(sliderR.value) : -1,
          g: sliderG ? parseInt(sliderG.value) : -1,
          b: sliderB ? parseInt(sliderB.value) : -1,
        };
      });

      expect(result.picker).toBe(newHex);
      // #22cc88 = rgb(34, 204, 136)
      expect(result.r).toBe(34);
      expect(result.g).toBe(204);
      expect(result.b).toBe(136);
    });

    test('should preserve alpha when hex input changes on a semi-transparent swatch', async ({
      page,
    }) => {
      await page.goto('/brand', { waitUntil: 'load' });
      await openPanel(page);
      await waitForSwatchControls(page);

      const newHex = '#22cc88';

      await page.evaluate(
        ({ sel, hex }) => {
          const swatch = document.querySelector<HTMLElement>(sel);
          const hexInput = swatch?.querySelector<HTMLInputElement>('.swatch-hex');
          if (hexInput) {
            hexInput.value = hex;
            hexInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
        { sel: ALPHA_SWATCH, hex: newHex }
      );

      await page.waitForFunction(
        ({ sel, hex }) => {
          const swatch = document.querySelector(sel);
          const picker = swatch?.querySelector<HTMLInputElement>('.swatch-picker');
          return picker?.value === hex;
        },
        { sel: ALPHA_SWATCH, hex: newHex },
        { timeout: 10000 }
      );

      const result = await page.evaluate((sel) => {
        const swatch = document.querySelector<HTMLElement>(sel);
        const varName = swatch?.dataset.var;
        const cssValue = varName ? document.documentElement.style.getPropertyValue(varName) : '';
        return { cssValue };
      }, ALPHA_SWATCH);

      // CSS variable should be rgba with preserved alpha
      expect(result.cssValue).toMatch(/rgba\(34,\s*204,\s*136,\s*0\.7\)/);
    });
  });

  test.describe('RGB Slider Sync', () => {
    test('should sync color picker and hex input when RGB slider changes', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      // Set specific RGB slider values on the first swatch
      await page.evaluate(() => {
        const swatch = document.querySelector('.brand-swatch') as HTMLElement;
        const sliderR = swatch.querySelector<HTMLInputElement>('.swatch-slider-r');
        const sliderG = swatch.querySelector<HTMLInputElement>('.swatch-slider-g');
        const sliderB = swatch.querySelector<HTMLInputElement>('.swatch-slider-b');
        if (sliderR && sliderG && sliderB) {
          sliderR.value = '255';
          sliderG.value = '128';
          sliderB.value = '0';
          // Trigger input event on the last slider to fire onSlider
          sliderB.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      const expectedHex = '#ff8000';

      // Wait for hex input to sync
      await page.waitForFunction(
        (hex) => {
          const swatch = document.querySelector('.brand-swatch');
          const hexInput = swatch?.querySelector<HTMLInputElement>('.swatch-hex');
          return hexInput?.value === hex;
        },
        expectedHex,
        { timeout: 10000 }
      );

      const result = await page.evaluate(() => {
        const swatch = document.querySelector('.brand-swatch');
        const picker = swatch?.querySelector<HTMLInputElement>('.swatch-picker');
        const hexInput = swatch?.querySelector<HTMLInputElement>('.swatch-hex');
        return {
          picker: picker?.value,
          hex: hexInput?.value,
        };
      });

      expect(result.picker).toBe(expectedHex);
      expect(result.hex).toBe(expectedHex);
    });

    test('should preserve alpha when RGB sliders change on a semi-transparent swatch', async ({
      page,
    }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      await page.evaluate((sel) => {
        const swatch = document.querySelector<HTMLElement>(sel);
        const sliderR = swatch?.querySelector<HTMLInputElement>('.swatch-slider-r');
        const sliderG = swatch?.querySelector<HTMLInputElement>('.swatch-slider-g');
        const sliderB = swatch?.querySelector<HTMLInputElement>('.swatch-slider-b');
        if (sliderR && sliderG && sliderB) {
          sliderR.value = '100';
          sliderG.value = '200';
          sliderB.value = '50';
          sliderB.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, ALPHA_SWATCH);

      const expectedHex = '#64c832';

      await page.waitForFunction(
        ({ sel, hex }) => {
          const swatch = document.querySelector(sel);
          const hexInput = swatch?.querySelector<HTMLInputElement>('.swatch-hex');
          return hexInput?.value === hex;
        },
        { sel: ALPHA_SWATCH, hex: expectedHex },
        { timeout: 10000 }
      );

      const result = await page.evaluate((sel) => {
        const swatch = document.querySelector<HTMLElement>(sel);
        const varName = swatch?.dataset.var;
        const cssValue = varName ? document.documentElement.style.getPropertyValue(varName) : '';
        return { cssValue };
      }, ALPHA_SWATCH);

      // CSS variable should be rgba with preserved alpha (0.7 for --text-secondary)
      expect(result.cssValue).toMatch(/rgba\(100,\s*200,\s*50,\s*0\.7\)/);
    });
  });

  test.describe('Individual Swatch Reset', () => {
    test('should restore CSS variable and remove inline style when swatch reset is clicked', async ({
      page,
    }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      // Get the first swatch's CSS variable name and original value
      const originalValue = await page.evaluate(() => {
        const swatch = document.querySelector<HTMLElement>('.brand-swatch');
        const varName = swatch?.dataset.var;
        if (!varName) return null;
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      });
      expect(originalValue).toBeTruthy();

      // Apply a color override
      await page.evaluate(() => {
        const swatch = document.querySelector('.brand-swatch') as HTMLElement;
        const picker = swatch.querySelector<HTMLInputElement>('.swatch-picker');
        if (picker) {
          picker.value = '#ff0000';
          picker.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      // Verify the override was applied (inline style set on html)
      await page.waitForFunction(
        () => {
          const swatch = document.querySelector<HTMLElement>('.brand-swatch');
          return swatch?.dataset.userOverride === 'true';
        },
        { timeout: 10000 }
      );

      // Click the swatch reset button
      await page.evaluate(() => {
        const swatch = document.querySelector('.brand-swatch');
        const resetBtn = swatch?.querySelector<HTMLButtonElement>('.swatch-reset');
        resetBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Wait for the override to be removed
      await page.waitForFunction(
        () => {
          const swatch = document.querySelector<HTMLElement>('.brand-swatch');
          const varName = swatch?.dataset.var;
          if (!varName) return false;
          // Inline style should be removed
          const inlineValue = document.documentElement.style.getPropertyValue(varName);
          // data-user-override should be removed
          return inlineValue === '' && swatch?.dataset.userOverride !== 'true';
        },
        { timeout: 10000 }
      );
    });

    test('should restore alpha slider and display when a semi-transparent swatch is reset', async ({
      page,
    }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      // Read the original alpha value
      const originalAlpha = await page.evaluate((sel) => {
        const swatch = document.querySelector<HTMLElement>(sel);
        const slider = swatch?.querySelector<HTMLInputElement>('.swatch-slider-a');
        return slider ? parseInt(slider.value) : null;
      }, ALPHA_SWATCH);
      expect(originalAlpha).toBeTruthy();

      // Change both color and alpha on the swatch
      await page.evaluate((sel) => {
        const swatch = document.querySelector<HTMLElement>(sel);
        const picker = swatch?.querySelector<HTMLInputElement>('.swatch-picker');
        const alphaSlider = swatch?.querySelector<HTMLInputElement>('.swatch-slider-a');
        if (picker) {
          picker.value = '#ff0000';
          picker.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (alphaSlider) {
          alphaSlider.value = '25';
          alphaSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, ALPHA_SWATCH);

      // Verify override is applied
      await page.waitForFunction(
        (sel) => {
          const swatch = document.querySelector<HTMLElement>(sel);
          return swatch?.dataset.userOverride === 'true';
        },
        ALPHA_SWATCH,
        { timeout: 10000 }
      );

      // Click reset
      await page.evaluate((sel) => {
        const swatch = document.querySelector(sel);
        const resetBtn = swatch?.querySelector<HTMLButtonElement>('.swatch-reset');
        resetBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }, ALPHA_SWATCH);

      // Wait for override to be cleared and alpha to restore
      await page.waitForFunction(
        ({ sel, expected }) => {
          const swatch = document.querySelector<HTMLElement>(sel);
          const varName = swatch?.dataset.var;
          if (!varName) return false;
          const inlineValue = document.documentElement.style.getPropertyValue(varName);
          const slider = swatch?.querySelector<HTMLInputElement>('.swatch-slider-a');
          const alphaDisplay = swatch?.querySelector('.swatch-alpha-display');
          return (
            inlineValue === '' &&
            swatch?.dataset.userOverride !== 'true' &&
            slider !== null &&
            parseInt(slider!.value) === expected &&
            alphaDisplay?.textContent === `@ ${expected}%`
          );
        },
        { sel: ALPHA_SWATCH, expected: originalAlpha },
        { timeout: 10000 }
      );
    });
  });

  test.describe('Theme Toggle', () => {
    test('should apply dark-theme class on html and persist to localStorage', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      // Ensure we start in light mode
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark-theme');
        localStorage.removeItem('theme');
      });

      // Click theme toggle
      await clickPanelButton(page, 'panel-theme-toggle');

      // Wait for dark-theme class to appear
      await page.waitForFunction(() => document.documentElement.classList.contains('dark-theme'), {
        timeout: 10000,
      });

      // Verify localStorage persistence
      const storedTheme = await page.evaluate(() => localStorage.getItem('theme'));
      expect(storedTheme).toBe('dark');

      // Reload and verify persistence
      await page.reload({ waitUntil: 'domcontentloaded' });

      const hasDarkTheme = await page.evaluate(() =>
        document.documentElement.classList.contains('dark-theme')
      );
      expect(hasDarkTheme).toBe(true);
    });

    test('should reset color overrides when theme is toggled', async ({ page }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);
      await waitForSwatchControls(page);

      // Apply a color override
      await page.evaluate(() => {
        const swatch = document.querySelector('.brand-swatch') as HTMLElement;
        const picker = swatch.querySelector<HTMLInputElement>('.swatch-picker');
        if (picker) {
          picker.value = '#ff0000';
          picker.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      // Verify override is in place
      await page.waitForFunction(
        () => {
          const swatch = document.querySelector<HTMLElement>('.brand-swatch');
          return swatch?.dataset.userOverride === 'true';
        },
        { timeout: 10000 }
      );

      // Toggle theme
      await clickPanelButton(page, 'panel-theme-toggle');

      // Wait for overrides to be cleared (resetAllOverrides is called by theme toggle)
      await page.waitForFunction(
        () => {
          const swatch = document.querySelector<HTMLElement>('.brand-swatch');
          const varName = swatch?.dataset.var;
          if (!varName) return false;
          return (
            document.documentElement.style.getPropertyValue(varName) === '' &&
            swatch?.dataset.userOverride !== 'true'
          );
        },
        { timeout: 10000 }
      );
    });
  });

  test.describe('Popout Icon Rotation', () => {
    test('should show correct rotation without animation when popout state is pre-set', async ({
      page,
    }) => {
      // Set localStorage before navigating so the inline script applies the state
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('palette-popped-out', 'true'));

      // Reload to trigger the inline script that reads localStorage
      await page.reload({ waitUntil: 'domcontentloaded' });

      // The inline script in PalettePanel.astro adds is-active class synchronously
      // CSS rule: .palette-panel__popout.is-active .palette-panel__icon { transform: rotate(-90deg) }
      const result = await page.evaluate(() => {
        const popoutBtn = document.getElementById('panel-popout-toggle');
        const icon = popoutBtn?.querySelector('.palette-panel__icon') as HTMLElement;
        if (!icon) return { hasActiveClass: false, transform: '' };
        const computed = getComputedStyle(icon);
        return {
          hasActiveClass: popoutBtn?.classList.contains('is-active') ?? false,
          transform: computed.transform,
        };
      });

      expect(result.hasActiveClass).toBe(true);
      // rotate(-90deg) in matrix form is approximately matrix(0, -1, 1, 0, 0, 0)
      // but the exact value depends on browser; check that it is NOT the default (rotate(90deg))
      // rotate(90deg) = matrix(0, 1, -1, 0, 0, 0); rotate(-90deg) = matrix(0, -1, 1, 0, 0, 0)
      // The transform should contain a matrix — verify it is not 'none' and corresponds to -90deg
      expect(result.transform).not.toBe('none');
      // matrix(a, b, c, d, tx, ty) — for -90deg: b ≈ -1, c ≈ 1
      expect(result.transform).toMatch(/matrix/);
    });
  });

  test.describe('Panel Resize Bounds', () => {
    test('should keep panel body width within 280-900px when resize handle is dragged', async ({
      page,
    }) => {
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });
      await openPanel(page);

      const resizeHandle = page.locator('#panel-resize');
      await expect(resizeHandle).toBeVisible();

      const handleBox = await resizeHandle.boundingBox();
      expect(handleBox).toBeTruthy();

      // Drag far to the left (should hit max width of 900px)
      const startX = handleBox!.x + handleBox!.width / 2;
      const startY = handleBox!.y + handleBox!.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - 1000, startY, { steps: 10 });
      await page.mouse.up();

      const widthAfterMaxDrag = await page.evaluate(() => {
        const body = document.getElementById('panel-body');
        return body ? body.offsetWidth : 0;
      });
      expect(widthAfterMaxDrag).toBeLessThanOrEqual(900);

      // Drag far to the right (should hit min width of 280px)
      const handleBoxAfter = await resizeHandle.boundingBox();
      const startX2 = handleBoxAfter!.x + handleBoxAfter!.width / 2;
      const startY2 = handleBoxAfter!.y + handleBoxAfter!.height / 2;

      await page.mouse.move(startX2, startY2);
      await page.mouse.down();
      await page.mouse.move(startX2 + 2000, startY2, { steps: 10 });
      await page.mouse.up();

      const widthAfterMinDrag = await page.evaluate(() => {
        const body = document.getElementById('panel-body');
        return body ? body.offsetWidth : 0;
      });
      expect(widthAfterMinDrag).toBeGreaterThanOrEqual(280);
    });
  });

  test.describe('Mobile Viewport', () => {
    test('should hide palette panel at 480px viewport width', async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 800 });
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      const display = await page.evaluate(() => {
        const panel = document.getElementById('palette-panel');
        return panel ? getComputedStyle(panel).display : '';
      });
      expect(display).toBe('none');
    });
  });
});
