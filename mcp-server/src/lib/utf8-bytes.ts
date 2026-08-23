/**
 * UTF-8 byte length, without `Buffer`.
 *
 * `Buffer.byteLength(s, 'utf8')` was the idiom here until BL-137. Two problems
 * with it, one runtime and one type-level:
 *
 *   - RUNTIME: `Buffer` is a Node global. It exists in the Worker only because
 *     `wrangler.toml` sets `nodejs_compat`; nothing in this module's contract
 *     should depend on that flag staying on.
 *   - TYPE-LEVEL: `worker.ts`'s `/// <reference types="@cloudflare/workers-types" />`
 *     loads a global script declaring `declare const Buffer: any`, which
 *     shadows `@types/node` program-wide. Every `Buffer.byteLength(...)` call
 *     reachable from that program was typed `any` — silently, since `any`
 *     never errors. See ADR-0020.
 *
 * `TextEncoder` is a WHATWG global present unconditionally in both the Workers
 * runtime and Node, and it is not shadowed by anything. This hoists the
 * private helper that `metrics/guard.ts` had already worked out for exactly
 * this reason.
 *
 * Byte-identical to `Buffer.byteLength(s, 'utf8')` for every input, including
 * lone surrogates (both encode U+FFFD as three bytes). Asserted against
 * `node:buffer` as an independent oracle in
 * `tests/unit/lib/utf8-bytes.test.ts`.
 */

/**
 * Module-singleton encoder. `TextEncoder` is stateless, so one instance serves
 * every caller; per-call construction is pure waste on hot paths like the
 * per-tool-invocation audit sizing in `metrics/with-metrics.ts`.
 */
const ENCODER = new TextEncoder();

/** UTF-8 byte length of `s` — the `Buffer.byteLength(s, 'utf8')` replacement. */
export function utf8ByteLength(s: string): number {
  return ENCODER.encode(s).length;
}
