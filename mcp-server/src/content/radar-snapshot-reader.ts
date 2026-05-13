/**
 * Transport-agnostic SnapshotReader interface for radar Resources
 * (BL-032.5 Phase 3).
 *
 * `resources/radar.ts` consumes this interface; the two concrete
 * implementations live in:
 *
 *   - `radar-snapshot-reader-stdio.ts`  — wraps the node:fs-backed
 *     `radar-snapshot.ts` (offline cache populated by `npm run radar:seed`)
 *   - `radar-snapshot-reader-worker.ts` — wraps the Upstash-backed
 *     `radar-live-store.ts` (cache populated by website ISR + the
 *     BL-032.5 Phase 4 hourly Worker Cron)
 *
 * Separating the interface from the implementations keeps node-only
 * modules out of the Worker bundle while preserving a single
 * registration path in `resources/radar.ts`.
 */

import type { RadarCategory, SnapshotTier } from './radar-transform';

export interface SnapshotReader {
  readFyi(): Promise<SnapshotTier | null>;
  readWire(): Promise<SnapshotTier | null>;
  readWireByCategory(category: RadarCategory): Promise<SnapshotTier | null>;
}
