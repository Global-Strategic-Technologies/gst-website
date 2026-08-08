/**
 * stdio SnapshotReader — wraps `radar-snapshot.ts` (the node:fs-backed
 * offline cache populated by `npm run radar:seed`).
 *
 * **Must never be imported by Worker-reachable code** — that is the
 * load-bearing half of this module's contract. The underlying
 * `radar-snapshot.ts` pulls `node:fs`/`node:crypto`/`node:path` and resolves
 * its cache directory from `import.meta.url`, which is `undefined` in the
 * Worker bundle; reaching it from there throws at call time, not import time.
 * That is how `gst_radar_brief_today` shipped broken over HTTP (see
 * BREAKING_CHANGES.md § 0.48.0).
 *
 * Importers, all stdio-side: `tools/_local-only.ts` (radar Resources + the
 * offline tool), `src/index.ts` (threads it into `createServer` as
 * `ctx.radarReader` so prompt embeds read through it), and
 * `tests/integration/protocol-roundtrip.test.ts` (mirrors the entrypoint).
 */

import { readFyiSnapshot, readWireSnapshot, readWireSnapshotByCategory } from './radar-snapshot';
import type { SnapshotReader } from './radar-snapshot-reader';
import type { RadarCategory } from './radar-transform';

export const stdioSnapshotReader: SnapshotReader = {
  async readFyi() {
    return readFyiSnapshot();
  },
  async readWire() {
    return readWireSnapshot();
  },
  async readWireByCategory(category: RadarCategory) {
    return readWireSnapshotByCategory(category);
  },
};
