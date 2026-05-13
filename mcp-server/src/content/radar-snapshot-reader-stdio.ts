/**
 * stdio SnapshotReader — wraps `radar-snapshot.ts` (the node:fs-backed
 * offline cache populated by `npm run radar:seed`).
 *
 * Used by `tools/_local-only.ts` for the stdio entrypoint. Not imported
 * by the Worker bundle because the underlying `radar-snapshot.ts` pulls
 * `node:fs`/`node:crypto`/`node:path` at module load time.
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
