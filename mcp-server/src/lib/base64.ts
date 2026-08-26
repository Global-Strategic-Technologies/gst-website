/**
 * Workers-safe base64 encoding for binary payloads.
 *
 * Body copied verbatim from the private helper in
 * `tools/generate-information-request-list-xlsx.ts` (the original), which
 * keeps its own copy because that file is inside the BL-140 freeze —
 * re-pointing it at this module would be an edit to a frozen surface.
 * This shared home exists so a third caller never mints a third copy.
 *
 * Not interchangeable with the OAuth helpers in `oauth/m2m-*.ts`: those
 * are base64url (URL-safe alphabet, no padding); this is standard base64
 * for data payloads (e.g. `.xlsx` bytes in a tool result).
 */
export function uint8ToBase64(buf: Uint8Array): string {
  // Chunked conversion: avoids the "too many arguments to apply" failure
  // on very large buffers in some runtimes. The IRL workbook is small
  // (~3-6 KB) so a single pass would also work; the chunked form is
  // defensive against future bullet-count growth.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < buf.byteLength; i += CHUNK) {
    const slice = buf.subarray(i, Math.min(i + CHUNK, buf.byteLength));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
