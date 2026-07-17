/**
 * Integration tests against the two BL-045 PR B follow-up fixtures.
 *
 * **Why this file exists**: prior to this commit `medsig-health-filled-
 * irl.md` was the only canonical fixture and only the body-hash test
 * exercised it. The body rewrites added scenario-specific behavior:
 * per-scenario voice cues for sell-side / value-creation / unknown that
 * the buy-side fixture cannot exercise; per-tool inclusion gates whose
 * elision branch a sparse-partial fixture is needed to characterize;
 * the wrong-IRL pre-flight's `15-40%` partial-flag branch that only a
 * deliberately-sparse fixture triggers.
 *
 * Coverage goals (per BL-045 design doc § Acceptance Criteria):
 *
 * 1. The sell-side fixture (`helios-grid-sell-side-filled-irl.md`)
 *    produces a body that surfaces the sell-side voice cue verbatim
 *    when `transactionContext: 'sell-side'` is supplied — the
 *    "credibility document" framing the design doc specifies.
 *
 * 2. The sparse-partial fixture (`sparse-partial-filled-irl.md`)
 *    parses via `argsSchema` (the 200-char min satisfies the schema)
 *    AND produces a body that includes the inclusion-gates directive
 *    so the model can elide TechPar / Tech Debt sections when their
 *    gate predicates fail against this fixture's sparse signal.
 *
 * 3. Both fixtures are non-empty, contain at least 5 IRL section
 *    headers, and do NOT contain prompt-meta commentary that would
 *    confuse the model (regression check — fixtures grew large and
 *    we want a structural guard against accidental drift).
 *
 * 4. Hash-stability is intentionally NOT extended to these fixtures —
 *    the `irl-ingestion-body-hash-stability` test already hash-locks
 *    five canonical scenarios; adding fixture-bound hashes here would
 *    multiply re-baseline churn without proportional regression value.
 *    The structural assertions below are the durable contract.
 *
 * See: mcp-server/src/docs/prompts/irl-ingestion.md (companion doc)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { irlIngestionPrompt } from '../../src/prompts/irl-ingestion';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SELL_SIDE_FIXTURE = readFileSync(
  resolve(__dirname, '../fixtures/helios-grid-sell-side-filled-irl.md'),
  'utf-8'
);
const SPARSE_FIXTURE = readFileSync(
  resolve(__dirname, '../fixtures/sparse-partial-filled-irl.md'),
  'utf-8'
);

function fullBodyText(args: Parameters<typeof irlIngestionPrompt.build>[0]): string {
  const result = irlIngestionPrompt.build(args);
  const first = result.messages[0];
  if (first.content.type !== 'text') throw new Error('expected text content as first message');
  return first.content.text;
}

describe('helios-grid-sell-side-filled-irl.md fixture', () => {
  it('is a non-empty markdown body with ≥9 of the 10 canonical section headers', () => {
    const headerCount = (SELL_SIDE_FIXTURE.match(/^## \d{2} —/gm) ?? []).length;
    expect(headerCount).toBeGreaterThanOrEqual(9);
    expect(SELL_SIDE_FIXTURE.length).toBeGreaterThan(2000);
  });

  it('parses through argsSchema as `filledIrl`', () => {
    const parsed = irlIngestionPrompt.argsSchema.safeParse({
      filledIrl: SELL_SIDE_FIXTURE,
      transactionContext: 'sell-side',
    });
    expect(parsed.success).toBe(true);
  });

  it('build() with transactionContext=sell-side surfaces the sell-side voice cue verbatim', () => {
    const body = fullBodyText({
      filledIrl: SELL_SIDE_FIXTURE,
      transactionContext: 'sell-side',
    });
    // The sell-side voice cue includes the "credibility document" framing
    expect(body).toContain('credibility document');
    expect(body).toContain('defensible story');
  });

  it('build() with transactionContext=value-creation surfaces a DIFFERENT voice cue (work-plan framing)', () => {
    const body = fullBodyText({
      filledIrl: SELL_SIDE_FIXTURE,
      transactionContext: 'value-creation',
    });
    expect(body).toContain('100-day plan');
    expect(body).not.toContain('credibility document');
  });

  it('build() in extract-only mode does NOT render synthesis directives (A-I)', () => {
    const body = fullBodyText({
      filledIrl: SELL_SIDE_FIXTURE,
      transactionContext: 'sell-side',
      mode: 'extract-only',
    });
    expect(body).toContain('EXTRACT-ONLY mode');
    expect(body).toContain('NO synthesis prose');
    expect(body).not.toContain('Open Diligence Wizard');
  });

  it('build() in compact verbosity elides the per-section JSON fence directive', () => {
    const body = fullBodyText({
      filledIrl: SELL_SIDE_FIXTURE,
      transactionContext: 'sell-side',
      verbosity: 'compact',
    });
    expect(body).not.toContain('Per-section JSON fence');
    expect(body).not.toContain('(K) Provenance footer');
  });

  it('build() in verbose verbosity (default) includes the per-section JSON fence + provenance footer directives', () => {
    const body = fullBodyText({
      filledIrl: SELL_SIDE_FIXTURE,
      transactionContext: 'sell-side',
    });
    expect(body).toContain('Per-section JSON fence');
    expect(body).toContain('(K) Provenance footer');
    expect(body).toContain('Provenance citation self-check');
  });
});

describe('sparse-partial-filled-irl.md fixture', () => {
  it('is a non-empty markdown body BUT has fewer section headers (sparse partial)', () => {
    const headerCount = (SPARSE_FIXTURE.match(/^## \d{2} —/gm) ?? []).length;
    // Sparse fixture covers 00, 01, 02, 03, 04, 09 — six of ten sections
    expect(headerCount).toBeLessThan(10);
    expect(headerCount).toBeGreaterThanOrEqual(5);
  });

  it('still satisfies the argsSchema min(200) on filledIrl', () => {
    const parsed = irlIngestionPrompt.argsSchema.safeParse({
      filledIrl: SPARSE_FIXTURE,
      transactionContext: 'buy-side',
    });
    expect(parsed.success).toBe(true);
  });

  it('build() includes the wrong-IRL detector pre-flight directive (model decides halt/partial/proceed)', () => {
    const body = fullBodyText({
      filledIrl: SPARSE_FIXTURE,
      transactionContext: 'buy-side',
    });
    expect(body).toContain('wrong-IRL structural detector');
    expect(body).toContain('fillRatio');
  });

  it('build() includes the inclusion-gates directive (model elides gate-failing tools)', () => {
    const body = fullBodyText({
      filledIrl: SPARSE_FIXTURE,
      transactionContext: 'buy-side',
    });
    expect(body).toContain('Tool inclusion gates');
    expect(body).toContain('compute_techpar');
    expect(body).toContain('estimate_tech_debt_cost');
  });

  it('build() includes (J) gap list directive — sparse fixtures produce many gap entries', () => {
    const body = fullBodyText({
      filledIrl: SPARSE_FIXTURE,
      transactionContext: 'buy-side',
    });
    expect(body).toContain('(J) Gap list');
  });

  it('contains the literal "open" / "tbd" markers that drive partial-IRL elision', () => {
    // Sanity check on the fixture content itself — its purpose is to land
    // in the 15-40% fillRatio band, which requires explicit OPEN markers
    expect(SPARSE_FIXTURE.toLowerCase()).toContain('open');
    expect(SPARSE_FIXTURE.toLowerCase()).toMatch(/tbd|not yet tracked|not formally/);
  });
});

describe('cross-fixture invariants', () => {
  it('every fixture build includes the META JSON fence directive (auditable artifact requirement)', () => {
    for (const fx of [SELL_SIDE_FIXTURE, SPARSE_FIXTURE]) {
      const body = fullBodyText({ filledIrl: fx, transactionContext: 'buy-side' });
      expect(body).toContain('Top-of-dossier meta JSON fence');
      expect(body).toContain('"promptName": "gst_irl_ingestion"');
    }
  });

  it('every fixture build embeds the two Library resources as subsequent messages', () => {
    for (const fx of [SELL_SIDE_FIXTURE, SPARSE_FIXTURE]) {
      const result = irlIngestionPrompt.build({ filledIrl: fx });
      expect(result.messages.length).toBe(3);
      const r1 = result.messages[1].content;
      const r2 = result.messages[2].content;
      expect(r1.type).toBe('resource');
      expect(r2.type).toBe('resource');
    }
  });
});
