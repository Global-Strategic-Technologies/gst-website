/**
 * Paper has no dark theme.
 *
 * Printed from dark or dim dark, every theme token printed its dark value:
 * near-white ink, and browsers print no backgrounds by default, so text
 * vanished on the white page (every hub tool's Export PDF). The dark values
 * live in more than `light-dark()` pairs — the palettes override their inks in
 * `html.dark-theme` blocks — so a print stylesheet would have to restate them
 * all. Instead the page leaves its theme (ADR-0038) for the length of the
 * print and restores it after: `beforeprint` and `afterprint` fire for
 * `window.print()` and the browser's own Print alike.
 *
 * Nothing persists: the stored theme is written only by the theme buttons, and
 * the palette observer keys on the palette, not the theme.
 */
import { DARK_CLASS, DIM_CLASS } from './theme-state';

let held: string[] = [];

export function enterPrintTheme(root: Element = document.documentElement): void {
  held = [DARK_CLASS, DIM_CLASS].filter((c) => root.classList.contains(c));
  root.classList.remove(...held);
}

export function leavePrintTheme(root: Element = document.documentElement): void {
  root.classList.add(...held);
  held = [];
}

window.addEventListener('beforeprint', () => enterPrintTheme());
window.addEventListener('afterprint', () => leavePrintTheme());
