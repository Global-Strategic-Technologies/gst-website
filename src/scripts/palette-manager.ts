/**
 * Palette Manager — site-wide palette switching, color editing, and panel controls.
 * Extracted from brand.astro for reuse across all pages via PalettePanel.
 */

import { PALETTE_NAMES, PALETTE_CONCEPTS, TOKEN_TIPS } from '../data/palettes';
import { rgbToHex, hexToRgb, parseAlpha } from '../utils/palette-utils';
import * as Sentry from '@sentry/browser';

// ── Helpers ────────────────────────────────────────────────

function isMobile(): boolean {
  return window.innerWidth <= 768;
}

/** Sync active tab state across both desktop edge tabs and mobile header tabs. */
function syncTabActiveState(id: number): void {
  document.querySelectorAll<HTMLElement>('.palette-panel__tab').forEach((tab) => {
    const tabId = parseInt(tab.dataset.palette || '0');
    tab.classList.toggle('palette-panel__tab--active', tabId === id);
  });
}

// ── Read & Populate ────────────────────────────────────────

function readAndPopulate(): void {
  const root = document.documentElement;
  const style = getComputedStyle(root);

  document.querySelectorAll<HTMLElement>('.brand-swatch').forEach((el) => {
    const varName = el.dataset.var;
    if (!varName) return;
    if (el.dataset.userOverride === 'true') return;

    const colorEl = el.querySelector<HTMLElement>('.brand-swatch__color');
    if (!colorEl) return;

    const resolved = getComputedStyle(colorEl).backgroundColor;
    const hex = rgbToHex(resolved);
    const alpha = parseAlpha(resolved);
    const valueEl = el.querySelector('.brand-swatch__value');
    if (valueEl) valueEl.textContent = alpha < 1 ? `${hex} @ ${Math.round(alpha * 100)}%` : hex;

    const picker = el.querySelector<HTMLInputElement>('.swatch-picker');
    const hexInput = el.querySelector<HTMLInputElement>('.swatch-hex');
    const sliderR = el.querySelector<HTMLInputElement>('.swatch-slider-r');
    const sliderG = el.querySelector<HTMLInputElement>('.swatch-slider-g');
    const sliderB = el.querySelector<HTMLInputElement>('.swatch-slider-b');
    const sliderA = el.querySelector<HTMLInputElement>('.swatch-slider-a');
    const alphaDisplay = el.querySelector('.swatch-alpha-display');
    if (picker && hex !== 'transparent') picker.value = hex;
    if (hexInput) hexInput.value = hex;
    const rgb = hexToRgb(hex);
    if (rgb && sliderR && sliderG && sliderB) {
      sliderR.value = String(rgb[0]);
      sliderG.value = String(rgb[1]);
      sliderB.value = String(rgb[2]);
    }
    if (sliderA) sliderA.value = String(Math.round(alpha * 100));
    if (alphaDisplay) alphaDisplay.textContent = `@ ${Math.round(alpha * 100)}%`;
  });

  // Brand-page-only elements (guarded — no-op on other pages)
  document.querySelectorAll<HTMLElement>('.brand-spacing-row').forEach((el) => {
    const varName = el.dataset.var;
    if (!varName) return;
    const raw = style.getPropertyValue(varName).trim();
    const valueEl = el.querySelector('.brand-spacing-value');
    if (valueEl) valueEl.textContent = raw;
  });

  document.querySelectorAll<HTMLElement>('.brand-shadow-value').forEach((el) => {
    const varName = el.dataset.var;
    if (!varName) return;
    el.textContent = style.getPropertyValue(varName).trim();
  });

  document.querySelectorAll<HTMLElement>('.brand-transition-value').forEach((el) => {
    const varName = el.dataset.var;
    if (!varName) return;
    el.textContent = style.getPropertyValue(varName).trim();
  });

  const fontStackEl = document.querySelector<HTMLElement>('.brand-font-stack');
  if (fontStackEl) fontStackEl.textContent = style.getPropertyValue('--font-family').trim();

  document.querySelectorAll<HTMLElement>('.brand-type-specimen').forEach((el) => {
    const specimen = el.querySelector<HTMLElement>('[data-specimen]');
    if (!specimen) return;
    const metaEl = el.querySelector('.brand-type-meta');
    if (metaEl) {
      const cs = getComputedStyle(specimen);
      metaEl.textContent = `${cs.fontSize} / wt ${cs.fontWeight} / lh ${cs.lineHeight}`;
    }
    const varName = el.dataset.var;
    const valueEl = el.querySelector('.brand-type-value');
    if (varName && valueEl) valueEl.textContent = style.getPropertyValue(varName).trim();
  });
}

// ── Color Editing ──────────────────────────────────────────

function getSwatchAlpha(swatch: HTMLElement): number | undefined {
  const slider = swatch.querySelector<HTMLInputElement>('.swatch-slider-a');
  return slider ? parseInt(slider.value) / 100 : undefined;
}

function applyColor(swatch: HTMLElement, hex: string, alpha?: number) {
  const colorEl = swatch.querySelector<HTMLElement>('.brand-swatch__color');
  const valueEl = swatch.querySelector('.brand-swatch__value');
  const picker = swatch.querySelector<HTMLInputElement>('.swatch-picker');
  const hexInput = swatch.querySelector<HTMLInputElement>('.swatch-hex');
  const sliderR = swatch.querySelector<HTMLInputElement>('.swatch-slider-r');
  const sliderG = swatch.querySelector<HTMLInputElement>('.swatch-slider-g');
  const sliderB = swatch.querySelector<HTMLInputElement>('.swatch-slider-b');
  const sliderA = swatch.querySelector<HTMLInputElement>('.swatch-slider-a');
  const alphaDisplay = swatch.querySelector('.swatch-alpha-display');

  const hasAlpha = alpha !== undefined && alpha < 1;
  const rgb = hexToRgb(hex);

  if (colorEl) {
    if (hasAlpha && rgb) {
      colorEl.style.backgroundColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    } else {
      colorEl.style.background = hex;
    }
  }

  if (valueEl) valueEl.textContent = hasAlpha ? `${hex} @ ${Math.round(alpha! * 100)}%` : hex;
  if (picker) picker.value = hex;
  if (hexInput) hexInput.value = hex;

  if (rgb && sliderR && sliderG && sliderB) {
    sliderR.value = String(rgb[0]);
    sliderG.value = String(rgb[1]);
    sliderB.value = String(rgb[2]);
  }
  if (sliderA && alpha !== undefined) sliderA.value = String(Math.round(alpha * 100));
  if (alphaDisplay && alpha !== undefined)
    alphaDisplay.textContent = `@ ${Math.round(alpha * 100)}%`;

  swatch.dataset.userOverride = 'true';

  const varName = swatch.dataset.var;
  if (varName) {
    if (hasAlpha && rgb) {
      document.documentElement.style.setProperty(
        varName,
        `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
      );
    } else {
      document.documentElement.style.setProperty(varName, hex);
    }
  }
}

// ── Inject Controls ────────────────────────────────────────

function injectControls() {
  document.querySelectorAll<HTMLElement>('.brand-swatch').forEach((el) => {
    if (el.querySelector('.swatch-controls')) return;

    const varName = el.dataset.var;
    if (varName && TOKEN_TIPS[varName]) el.title = TOKEN_TIPS[varName];

    const colorEl = el.querySelector<HTMLElement>('.brand-swatch__color');
    if (!colorEl) return;
    const resolved = getComputedStyle(colorEl).backgroundColor;
    const initialHex = rgbToHex(resolved);
    if (initialHex === 'transparent') return;
    const rgb = hexToRgb(initialHex) || [0, 0, 0];
    const initialAlpha = parseAlpha(resolved);
    const hasAlpha = initialAlpha < 1;

    const alphaDisplayHtml = hasAlpha
      ? `<span class="swatch-alpha-display">@ ${Math.round(initialAlpha * 100)}%</span>`
      : '';
    const alphaSliderHtml = hasAlpha
      ? `<label class="swatch-slider-label swatch-slider-label--a">A<input type="range" class="swatch-slider swatch-slider-a" min="0" max="100" value="${Math.round(initialAlpha * 100)}" /></label>`
      : '';

    const controls = document.createElement('div');
    controls.className = 'swatch-controls';
    controls.innerHTML = `
      <div class="swatch-controls__row">
        <input type="color" class="swatch-picker" value="${initialHex}" />
        <input type="text" class="swatch-hex" value="${initialHex}" maxlength="7" spellcheck="false" />
        ${alphaDisplayHtml}
        <button class="swatch-reset" title="Reset to palette default" type="button">&times;</button>
      </div>
      <div class="swatch-sliders">
        <label class="swatch-slider-label swatch-slider-label--r">R<input type="range" class="swatch-slider swatch-slider-r" min="0" max="255" value="${rgb[0]}" /></label>
        <label class="swatch-slider-label swatch-slider-label--g">G<input type="range" class="swatch-slider swatch-slider-g" min="0" max="255" value="${rgb[1]}" /></label>
        <label class="swatch-slider-label swatch-slider-label--b">B<input type="range" class="swatch-slider swatch-slider-b" min="0" max="255" value="${rgb[2]}" /></label>
        ${alphaSliderHtml}
      </div>
    `;
    el.appendChild(controls);

    const picker = controls.querySelector<HTMLInputElement>('.swatch-picker')!;
    const hexInput = controls.querySelector<HTMLInputElement>('.swatch-hex')!;
    const sliderR = controls.querySelector<HTMLInputElement>('.swatch-slider-r')!;
    const sliderG = controls.querySelector<HTMLInputElement>('.swatch-slider-g')!;
    const sliderB = controls.querySelector<HTMLInputElement>('.swatch-slider-b')!;
    const sliderA = controls.querySelector<HTMLInputElement>('.swatch-slider-a');
    const resetBtn = controls.querySelector<HTMLButtonElement>('.swatch-reset')!;

    picker.addEventListener('input', () => applyColor(el, picker.value, getSwatchAlpha(el)));

    hexInput.addEventListener('input', () => {
      let v = hexInput.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) applyColor(el, v, getSwatchAlpha(el));
    });

    const onSlider = () => {
      const r = parseInt(sliderR.value).toString(16).padStart(2, '0');
      const g = parseInt(sliderG.value).toString(16).padStart(2, '0');
      const b = parseInt(sliderB.value).toString(16).padStart(2, '0');
      const hex = `#${r}${g}${b}`;
      applyColor(el, hex, getSwatchAlpha(el));
    };

    sliderR.addEventListener('input', onSlider);
    sliderG.addEventListener('input', onSlider);
    sliderB.addEventListener('input', onSlider);

    if (sliderA) {
      sliderA.addEventListener('input', () => {
        const alpha = parseInt(sliderA.value) / 100;
        const currentHex = hexInput.value;
        applyColor(el, currentHex, alpha);
      });
    }

    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const varName = el.dataset.var;
      if (colorEl && varName) {
        if (hasAlpha) {
          colorEl.style.backgroundColor = `var(${varName})`;
        } else {
          colorEl.style.background = `var(${varName})`;
        }
      }
      if (varName) document.documentElement.style.removeProperty(varName);
      delete el.dataset.userOverride;
      requestAnimationFrame(() => {
        const fresh = getComputedStyle(colorEl!).backgroundColor;
        const freshHex = rgbToHex(fresh);
        const freshAlpha = parseAlpha(fresh);
        const valueEl = el.querySelector('.brand-swatch__value');
        if (valueEl)
          valueEl.textContent =
            freshAlpha < 1 ? `${freshHex} @ ${Math.round(freshAlpha * 100)}%` : freshHex;
        if (picker) picker.value = freshHex === 'transparent' ? '#000000' : freshHex;
        if (hexInput) hexInput.value = freshHex;
        const freshRgb = hexToRgb(freshHex);
        if (freshRgb) {
          sliderR.value = String(freshRgb[0]);
          sliderG.value = String(freshRgb[1]);
          sliderB.value = String(freshRgb[2]);
        }
        if (sliderA) sliderA.value = String(Math.round(freshAlpha * 100));
        const alphaDisplay = el.querySelector('.swatch-alpha-display');
        if (alphaDisplay) alphaDisplay.textContent = `@ ${Math.round(freshAlpha * 100)}%`;
      });
    });
  });
}

// ── Palette Switching ──────────────────────────────────────

function switchPalette(id: number) {
  const html = document.documentElement;
  html.className = html.className.replace(/\bpalette-\d\b/g, '').trim();
  html.classList.add(`palette-${id}`);

  // Persist
  try {
    localStorage.setItem('palette', String(id));
  } catch {
    Sentry.addBreadcrumb({
      category: 'palette-manager',
      message: 'localStorage write failed',
      level: 'warning',
    });
  }

  // Update brand-page-specific UI (no-op on other pages)
  const conceptEl = document.getElementById('palette-concept');
  if (conceptEl) conceptEl.textContent = PALETTE_CONCEPTS[id] || '';
  const nameEl = document.getElementById('panel-palette-name');
  if (nameEl) nameEl.textContent = PALETTE_NAMES[id] || '';

  // Update tab active state (both desktop edge tabs and mobile header tabs)
  syncTabActiveState(id);

  requestAnimationFrame(() => readAndPopulate());
}

function resetAllOverrides() {
  // Clear inline style overrides from <html>
  const html = document.documentElement;
  // Only remove color-related inline styles, preserve other attributes
  document.querySelectorAll<HTMLElement>('.brand-swatch').forEach((el) => {
    const varName = el.dataset.var;
    if (varName) html.style.removeProperty(varName);
    delete el.dataset.userOverride;
    const colorEl = el.querySelector<HTMLElement>('.brand-swatch__color');
    if (colorEl && varName) {
      if (colorEl.classList.contains('brand-swatch__color--checker')) {
        colorEl.style.backgroundColor = `var(${varName})`;
      } else {
        colorEl.style.background = `var(${varName})`;
      }
    }
  });

  requestAnimationFrame(() => readAndPopulate());
}

// ── Theme Observer ─────────────────────────────────────────

let themeObserverPaused = false;

new MutationObserver(() => {
  if (themeObserverPaused) return;
  resetAllOverrides();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

// ── DOM Ready ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  injectControls();
  readAndPopulate();

  // ── DOM references ──────────────────────────────────────
  const panel = document.getElementById('palette-panel');
  const panelBody = document.getElementById('panel-body');
  const panelResize = document.getElementById('panel-resize');
  const fab = document.getElementById('panel-fab');
  const backdrop = document.getElementById('panel-backdrop');
  const grabHandle = document.getElementById('panel-grab-handle');
  const mobileHeader = document.getElementById('panel-mobile-header');

  // ── Shared action: open panel ───────────────────────────
  function openPanel(): void {
    if (!panel) return;
    panel.classList.add('is-open');
    if (isMobile()) {
      document.body.style.overflow = 'hidden';
      if (backdrop) {
        backdrop.hidden = false;
        void backdrop.offsetHeight;
        backdrop.classList.add('is-visible');
      }
    }
    requestAnimationFrame(() => readAndPopulate());
  }

  // ── Shared action: close panel ──────────────────────────
  function closePanel(): void {
    if (!panel) return;
    panel.classList.remove('is-open');
    if (isMobile()) {
      document.body.style.overflow = '';
      backdrop?.classList.remove('is-visible');
      setTimeout(() => {
        if (backdrop) backdrop.hidden = true;
      }, 300);
    }
  }

  // ── Shared action: select palette ───────────────────────
  function handlePaletteSelect(id: number): void {
    themeObserverPaused = true;
    switchPalette(id);
    themeObserverPaused = false;
  }

  // ── Shared action: toggle theme ─────────────────────────
  function handleThemeToggle(): void {
    themeObserverPaused = true;
    document.documentElement.classList.toggle('dark-theme');
    const isDark = document.documentElement.classList.contains('dark-theme');
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      Sentry.addBreadcrumb({
        category: 'palette-manager',
        message: 'localStorage write failed',
        level: 'warning',
      });
    }
    themeObserverPaused = false;
    resetAllOverrides();
  }

  // ── Shared action: toggle popout ────────────────────────
  // All popout buttons (desktop edge + mobile clone) call this.
  // The mobile label is updated by the caller after this returns.
  function handlePopoutToggle(): void {
    const html = document.documentElement;
    const wasPopped = html.classList.contains('palette-popped-out');
    themeObserverPaused = true;
    html.classList.toggle('palette-popped-out');
    themeObserverPaused = false;

    // Sync is-active on ALL popout buttons (desktop + mobile clones)
    document
      .querySelectorAll<HTMLElement>(
        '#panel-popout-toggle, .palette-panel__mobile-header .palette-panel__popout'
      )
      .forEach((btn) => btn.classList.toggle('is-active'));

    try {
      localStorage.setItem('palette-popped-out', wasPopped ? 'false' : 'true');
    } catch {
      Sentry.addBreadcrumb({
        category: 'palette-manager',
        message: 'localStorage write failed',
        level: 'warning',
      });
    }

    // On mobile non-brand pages, manage FAB visibility
    if (isMobile()) {
      const isBrandPage = html.hasAttribute('data-palette-always');
      if (wasPopped && !isBrandPage) {
        closePanel();
        if (fab) fab.style.display = 'none';
      } else if (!wasPopped && !isBrandPage) {
        if (fab) fab.style.display = '';
      }
    }
  }

  // ── Wire desktop controls ───────────────────────────────

  // Panel toggle (edge strip delta button)
  const panelToggle = document.getElementById('panel-toggle');
  panelToggle?.addEventListener('click', () => {
    if (panel?.classList.contains('is-open')) {
      closePanel();
    } else {
      openPanel();
    }
  });

  // Desktop palette tabs
  document.querySelectorAll<HTMLElement>('#palette-tabs .palette-panel__tab').forEach((tab) => {
    tab.addEventListener('click', () => handlePaletteSelect(parseInt(tab.dataset.palette || '0')));
  });

  // Desktop theme toggle
  document.getElementById('panel-theme-toggle')?.addEventListener('click', handleThemeToggle);

  // Desktop popout toggle
  const popoutBtn = document.getElementById('panel-popout-toggle');
  if (popoutBtn) {
    if (document.documentElement.classList.contains('palette-popped-out')) {
      popoutBtn.classList.add('is-active');
    }
    popoutBtn.addEventListener('click', handlePopoutToggle);
  }

  // Reset all button
  document.getElementById('reset-all')?.addEventListener('click', resetAllOverrides);

  // ── Wire mobile controls ────────────────────────────────

  // Clone tabs and controls into mobile header
  if (mobileHeader) {
    // Clone palette tabs
    document.querySelectorAll<HTMLElement>('#palette-tabs .palette-panel__tab').forEach((tab) => {
      const clone = tab.cloneNode(true) as HTMLElement;
      mobileHeader.appendChild(clone);
      clone.addEventListener('click', () =>
        handlePaletteSelect(parseInt(clone.dataset.palette || '0'))
      );
    });

    // Clone popout (left position) with text label
    const popoutClone = document.getElementById('panel-popout-toggle')?.cloneNode(true) as
      | HTMLElement
      | undefined;
    if (popoutClone) {
      popoutClone.removeAttribute('id');
      mobileHeader.appendChild(popoutClone);
      const popoutLabel = document.createElement('span');
      popoutLabel.className = 'palette-panel__popout-label';
      const isPopped = document.documentElement.classList.contains('palette-popped-out');
      popoutLabel.textContent = isPopped ? 'All Pages' : 'Brand Only';
      popoutClone.appendChild(popoutLabel);
      popoutClone.addEventListener('click', () => {
        handlePopoutToggle();
        const nowPopped = document.documentElement.classList.contains('palette-popped-out');
        popoutLabel.textContent = nowPopped ? 'All Pages' : 'Brand Only';
      });
    }

    // Clone theme toggle (right position)
    const themeClone = document.getElementById('panel-theme-toggle')?.cloneNode(true) as
      | HTMLElement
      | undefined;
    if (themeClone) {
      themeClone.removeAttribute('id');
      mobileHeader.appendChild(themeClone);
      themeClone.addEventListener('click', handleThemeToggle);
    }
  }

  // FAB and backdrop
  fab?.addEventListener('click', openPanel);
  backdrop?.addEventListener('click', closePanel);

  // Mobile: tap swatch to expand its controls (one at a time)
  document.querySelectorAll<HTMLElement>('.palette-panel .brand-swatch').forEach((swatch) => {
    swatch.addEventListener('click', (e) => {
      if (!isMobile()) return;
      if ((e.target as HTMLElement).closest('.swatch-controls')) return;
      const wasExpanded = swatch.classList.contains('swatch-expanded');
      document
        .querySelectorAll<HTMLElement>('.palette-panel .brand-swatch.swatch-expanded')
        .forEach((s) => s.classList.remove('swatch-expanded'));
      if (!wasExpanded) swatch.classList.add('swatch-expanded');
    });
  });

  // ── Touch gestures (mobile only) ───────────────────────
  let sheetStartY = 0;
  let sheetCurrentY = 0;

  grabHandle?.addEventListener(
    'touchstart',
    (e) => {
      sheetStartY = e.touches[0].clientY;
      sheetCurrentY = sheetStartY;
      if (panel) panel.style.transition = 'none';
    },
    { passive: true }
  );

  grabHandle?.addEventListener(
    'touchmove',
    (e) => {
      sheetCurrentY = e.touches[0].clientY;
      const dy = Math.max(0, sheetCurrentY - sheetStartY);
      if (panel) panel.style.transform = `translateY(${dy}px)`;
    },
    { passive: true }
  );

  grabHandle?.addEventListener('touchend', () => {
    if (panel) {
      panel.style.transition = '';
      panel.style.transform = '';
    }
    if (sheetCurrentY - sheetStartY > 80) closePanel();
  });

  // ── Footer-aware FAB positioning ────────────────────────
  const footer = document.querySelector('footer');
  if (footer && fab) {
    const updateFabPosition = () => {
      if (!isMobile()) return;
      const footerTop = footer.getBoundingClientRect().top;
      const viewportH = window.innerHeight;
      fab.style.bottom = footerTop < viewportH ? `${viewportH - footerTop + 16}px` : '16px';
    };
    window.addEventListener('scroll', updateFabPosition, { passive: true });
    updateFabPosition();
  }

  // ── Viewport change cleanup ─────────────────────────────
  window.addEventListener('resize', () => {
    if (!isMobile() && panel?.classList.contains('is-open') && backdrop) {
      document.body.style.overflow = '';
      backdrop.classList.remove('is-visible');
      backdrop.hidden = true;
      if (fab) fab.style.bottom = '16px';
    }
  });

  // ── Desktop resize handle (mouse only) ──────────────────
  if (panelResize && panelBody && panel) {
    const MIN_WIDTH = 280;
    const MAX_WIDTH = 900;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartWidth = 0;

    panelResize.addEventListener('mousedown', (e: MouseEvent) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartWidth = panelBody.offsetWidth;
      panelResize.classList.add('is-dragging');
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = dragStartX - e.clientX;
      panelBody.style.width = `${Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth + dx))}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      panelResize.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  // ── Sync persisted palette on load ──────────────────────
  const currentPalette = document.documentElement.className.match(/palette-(\d)/);
  if (currentPalette) {
    const id = parseInt(currentPalette[1]);
    syncTabActiveState(id);
    const nameEl = document.getElementById('panel-palette-name');
    if (nameEl) nameEl.textContent = PALETTE_NAMES[id] || '';
    const conceptEl = document.getElementById('palette-concept');
    if (conceptEl) conceptEl.textContent = PALETTE_CONCEPTS[id] || '';
  }
});
