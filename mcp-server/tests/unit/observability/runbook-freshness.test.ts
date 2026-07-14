/**
 * Runbook ↔ rule lockstep + staleness guard (BL-032.75 Phase 3 AC:
 * "CI fails if a runbook is > 6 months stale").
 *
 * Two invariants:
 *   1. Every rule in ALERT_RULES has a runbook file at its declared path.
 *   2. Every runbook carries a `lastReviewedAt: YYYY-MM-DD` line less than
 *      6 months old — forcing a periodic re-read so recovery procedures
 *      don't silently rot as the substrate evolves. Re-reviewing = update
 *      the date in the same PR as the review.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ALERT_RULES } from '../../../src/observability/alert-rules';

const MCP_SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SIX_MONTHS_MS = 183 * 24 * 3600 * 1000;

describe('runbook freshness (BL-032.75 Phase 3 staleness AC)', () => {
  for (const rule of ALERT_RULES) {
    describe(rule.id, () => {
      const runbookPath = path.join(MCP_SERVER_ROOT, rule.runbook);

      it('has a runbook file at the path the rule declares', () => {
        expect(existsSync(runbookPath), `missing runbook: ${rule.runbook}`).toBe(true);
      });

      it('carries a lastReviewedAt date under 6 months old', () => {
        const content = readFileSync(runbookPath, 'utf8');
        const m = content.match(/lastReviewedAt:\s*(\d{4}-\d{2}-\d{2})/);
        expect(m, `no lastReviewedAt line in ${rule.runbook}`).not.toBeNull();
        const reviewedAt = new Date(`${m![1]}T00:00:00Z`).getTime();
        expect(Number.isFinite(reviewedAt)).toBe(true);
        const ageMs = Date.now() - reviewedAt;
        expect(
          ageMs,
          `${rule.runbook} lastReviewedAt ${m![1]} is > 6 months stale — re-review the procedure and bump the date`
        ).toBeLessThan(SIX_MONTHS_MS);
      });

      it('documents its trigger threshold provenance (cites slo-baselines.md)', () => {
        const content = readFileSync(runbookPath, 'utf8');
        expect(content).toContain('slo-baselines.md');
      });
    });
  }
});
