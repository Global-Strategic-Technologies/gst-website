const ESC_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape HTML special characters in a string.
 * Pure function — no DOM dependency, safe for SSR and unit tests.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}
