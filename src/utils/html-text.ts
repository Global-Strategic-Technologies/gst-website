/**
 * HTML → plain text helpers, shared by the website and the MCP Worker (BL-109).
 *
 * Both functions previously lived module-private in `src/lib/inoreader/transform.ts`.
 * They moved here for one reason: the MCP radar handlers need `stripHtml` to project
 * Inoreader summaries down to text, and `src/lib/inoreader/transform.ts` is website
 * *display* code. Every server import from that module is `import type` and therefore
 * erased at emit; a runtime import would be the first value import from a display
 * module into the Worker graph. `src/utils/` is the established home for dual-surface
 * runtime modules (`radar-url.ts`, `portfolio-url.ts`), and this file imports nothing,
 * so it stays a dependency-free leaf.
 *
 * They travel together on purpose: `transform.ts`'s FYI adapter is
 * `truncate(stripHtml(…), 250)` — one idiom, and splitting it across modules to save a
 * file would be the worse trade.
 *
 * Neither is radar-specific, which is why this is a text leaf and not a radar one.
 */

/**
 * Strip HTML tags and decode the entity set Inoreader actually emits, then collapse
 * whitespace.
 *
 * **Scope, stated so the saving is not over-generalised**: this removes *tags*, so the
 * inner text of `<script>` / `<style>` blocks survives while `<img>` and tracking
 * markup vanish entirely — the latter is where the byte saving comes from. It is a
 * text-extraction helper for feed prose, **not** a sanitiser; do not use it to make
 * untrusted HTML safe to render.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncate at a word boundary, appending an ellipsis. Returns `text` unchanged when it fits. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
}
