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
import { runIrlProvenanceCheck } from '../../src/schemas/validate-irl-provenance';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SELL_SIDE_FIXTURE = readFileSync(
  resolve(__dirname, '../fixtures/helios-grid-sell-side-filled-irl.md'),
  'utf-8'
);
const SPARSE_FIXTURE = readFileSync(
  resolve(__dirname, '../fixtures/sparse-partial-filled-irl.md'),
  'utf-8'
);
/**
 * BL-120. Unlike the two fixtures above — which are hand-authored "returned
 * IRL" markdown — this one is **verbatim output of `extract-irl-markdown.mjs`**
 * over a synthetic 7-column workbook. That provenance is the point: it carries
 * the exact bytes an operator pastes, so a drift between the extractor's
 * composition and what the prompt tells the model to produce shows up here
 * rather than in a client dossier.
 *
 * It deliberately covers every branch of the composition rule: answers joined
 * from Response + Comments, answers sourced from Comments alone, `(Source:)`
 * and `(Note:)` suffixes in both orders of presence, a row with only a File
 * Location (which must still read `<NO RESPONSE>`), a row with only a Note, a
 * CLOSED row with nothing at all, and answers containing their own em-dashes.
 */
const WORKBOOK_COLUMNS_FIXTURE = readFileSync(
  resolve(__dirname, '../fixtures/northwind-workbook-columns-filled-irl.md'),
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

describe('northwind-workbook-columns-filled-irl.md fixture (BL-120)', () => {
  /** The bullet stream, one entry per filled request row. */
  const BULLETS = WORKBOOK_COLUMNS_FIXTURE.split('\n').filter((l) => l.startsWith('- '));

  it('parses through argsSchema as `filledIrl`', () => {
    const parsed = irlIngestionPrompt.argsSchema.safeParse({
      filledIrl: WORKBOOK_COLUMNS_FIXTURE,
      transactionContext: 'buy-side',
    });
    expect(parsed.success).toBe(true);
  });

  it('is in the canonical extractor shape — every bullet is `<ref> <request> [<STATUS>] — …`', () => {
    expect(BULLETS.length).toBe(28);
    for (const b of BULLETS) {
      expect(b).toMatch(/^- \d{1,2}-\d{2} .+ \[(OPEN|PARTIAL|CLOSED)\] — .+$/);
    }
    // Section headers and intros are dropped by the extractor; the body is a
    // flat bullet stream under a single H1 plus the metadata preamble.
    expect(WORKBOOK_COLUMNS_FIXTURE.split('\n')[0]).toBe(
      '# Information Request List — Northwind Freight Systems (filled)'
    );
    expect(WORKBOOK_COLUMNS_FIXTURE).not.toMatch(/^## /m);
  });

  it('carries an answer joined from Response and Comments, contiguously', () => {
    expect(WORKBOOK_COLUMNS_FIXTURE).toContain(
      '- 0-03 Annual recurring revenue (most recent quarter, plus prior 12 months) [CLOSED] — ' +
        '$38.6M Q2-FY26 annualized; $29.9M trailing twelve months. ' +
        'Excludes the two tuck-in acquisitions that closed in Q4 FY26 ' +
        '(Source: VDR/03-Financials/arr-bridge-FY26Q2.xlsx) (Note: Unaudited; audit completes September)'
    );
  });

  it('carries an answer sourced from Comments alone (Response empty)', () => {
    expect(WORKBOOK_COLUMNS_FIXTURE).toContain(
      '- 0-02 Engagement context [CLOSED] — Buy-side diligence, pre-LOI; sponsor is evaluating ' +
        'a platform acquisition in mid-market freight brokerage'
    );
  });

  it('keeps File-Location-only and Note-only rows unanswered', () => {
    // The fill-ratio guard, in fixture form: a VDR path is a promise of an
    // answer, not an answer.
    expect(WORKBOOK_COLUMNS_FIXTURE).toContain(
      '- 1-03 Product roadmap snapshot [OPEN] — <NO RESPONSE> (Source: VDR/01-Product/roadmap-FY27.pdf)'
    );
    expect(WORKBOOK_COLUMNS_FIXTURE).toContain(
      '- 4-03 Code review practice [OPEN] — <NO RESPONSE> (Note: Ask in the management call)'
    );
    // And the genuine contradiction: CLOSED with nothing anywhere.
    expect(WORKBOOK_COLUMNS_FIXTURE).toContain(
      '- 0-07 Year-over-year growth rate [CLOSED] — <NO RESPONSE>'
    );
  });

  it('has no join artifacts anywhere in the body', () => {
    // `,.` and `..` are what a naive "always append a period" join produces.
    expect(WORKBOOK_COLUMNS_FIXTURE).not.toContain(',.');
    expect(WORKBOOK_COLUMNS_FIXTURE).not.toContain('..');
    // Source always precedes Note when both are present.
    for (const b of BULLETS) {
      if (b.includes('(Source:') && b.includes('(Note:')) {
        expect(b.indexOf('(Source:')).toBeLessThan(b.indexOf('(Note:'));
      }
    }
    // `<NO RESPONSE>` is never followed by answer prose — only by suffixes.
    for (const b of BULLETS.filter((l) => l.includes('<NO RESPONSE>'))) {
      expect(b).toMatch(/— <NO RESPONSE>( \(Source: [^)]*\))?( \(Note: [^)]*\))?$/);
    }
  });

  it('builds a body that embeds the fixture verbatim alongside the column contract', () => {
    const body = fullBodyText({
      filledIrl: WORKBOOK_COLUMNS_FIXTURE,
      transactionContext: 'buy-side',
    });
    expect(body).toContain(WORKBOOK_COLUMNS_FIXTURE);
    // The contract that tells a model reading the workbook to produce exactly
    // these bytes. Without this pairing the fixture proves only that the
    // extractor is self-consistent.
    expect(body).toContain('- <ref> <request> [<STATUS>] — <answer> (Source: <D>) (Note: <F>)');
    expect(body).toContain(
      '| Reference | Request | Status | File Location | Comments | Notes | Response |'
    );
  });

  it('verifies citations that read across the Response→Comments boundary', () => {
    // The prompt-path half of the B2 regression: a citation spanning the join,
    // with the joining period dropped, against real extractor bytes.
    const result = runIrlProvenanceCheck({
      filledIrl: WORKBOOK_COLUMNS_FIXTURE,
      citations: [
        {
          path: 'arr',
          citation:
            'Section 00 row 0-03 — $29.9M trailing twelve months Excludes the two tuck-in acquisitions that closed in Q4 FY26',
        },
        {
          path: 'eng-count',
          citation:
            'Section 02 row 2-02 — 5 SRE, 3 security. Contractors are excluded from this count.',
        },
      ],
    });
    expect(result.verdicts.map((v) => v.status)).toEqual(['verified', 'verified']);
    expect(result.unverified).toBe(0);
  });

  it('verifies a citation whose answer contains its own em-dash', () => {
    // `extractExcerpt` anchors on the LAST em-dash, so an answer carrying one
    // is only citable from that point onward. Pinned because three of this
    // fixture's answers do (`64 total — 41 product…`, `Latacora, February 2026
    // — 0 Critical…`).
    const result = runIrlProvenanceCheck({
      filledIrl: WORKBOOK_COLUMNS_FIXTURE,
      citations: [
        { path: 'pentest', citation: 'Section 06 row 6-01 — 0 Critical, 3 High (all remediated)' },
      ],
    });
    expect(result.verdicts[0].status).toBe('verified');
  });

  it('shows what the em-dash truncation actually costs: only the tail is checked', () => {
    // The hazard the prompt warns about, made concrete. `extractExcerpt` keeps
    // only the text after the LAST em-dash, so everything a citation says
    // BEFORE that point is never verified against anything. Here the vendor is
    // wrong — the fixture says Latacora, the citation says Bishop Fox — and the
    // verdict is still `verified`, because the check only ever saw
    // "0 Critical, 3 High (all remediated)".
    //
    // Nothing to fix in the matcher: this is `extractExcerpt`'s documented
    // contract (BL-049 hardening, anchoring on the last em-dash so a citation
    // echoing a section header does not drag the header in as noise). It is
    // recorded here because BL-120 put three more prose columns into every
    // bullet, which makes answers containing em-dashes far more common than
    // they were — so the failure mode is now much easier to reach.
    const result = runIrlProvenanceCheck({
      filledIrl: WORKBOOK_COLUMNS_FIXTURE,
      citations: [
        {
          path: 'pentest-wrong-vendor',
          citation: 'Section 06 — Bishop Fox, February 2026 — 0 Critical, 3 High (all remediated)',
        },
      ],
    });
    expect(result.verdicts[0].status).toBe('verified');
    expect(WORKBOOK_COLUMNS_FIXTURE).not.toContain('Bishop Fox');
    // And the proof that the tail is doing all the work: break the tail and the
    // same citation fails, while the fabricated head made no difference at all.
    const broken = runIrlProvenanceCheck({
      filledIrl: WORKBOOK_COLUMNS_FIXTURE,
      citations: [
        {
          path: 'pentest-broken-tail',
          citation: 'Section 06 — Latacora, February 2026 — 9 Critical, 8 High (none remediated)',
        },
      ],
    });
    expect(broken.verdicts[0].status).toBe('unverified');
  });
});

describe('cross-fixture invariants', () => {
  it('every fixture build includes the META JSON fence directive (auditable artifact requirement)', () => {
    for (const fx of [SELL_SIDE_FIXTURE, SPARSE_FIXTURE, WORKBOOK_COLUMNS_FIXTURE]) {
      const body = fullBodyText({ filledIrl: fx, transactionContext: 'buy-side' });
      expect(body).toContain('Top-of-dossier meta JSON fence');
      expect(body).toContain('"promptName": "gst_irl_ingestion"');
    }
  });

  it('every fixture build embeds the two Library resources as subsequent messages', () => {
    for (const fx of [SELL_SIDE_FIXTURE, SPARSE_FIXTURE, WORKBOOK_COLUMNS_FIXTURE]) {
      const result = irlIngestionPrompt.build({ filledIrl: fx });
      expect(result.messages.length).toBe(3);
      const r1 = result.messages[1].content;
      const r2 = result.messages[2].content;
      expect(r1.type).toBe('resource');
      expect(r2.type).toBe('resource');
    }
  });
});
